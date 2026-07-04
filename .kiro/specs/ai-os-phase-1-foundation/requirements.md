# Requirements Document

## Introduction

This document specifies **Phase 1 — Foundation** of converting LocalMind (a privacy-first local AI desktop app built with Electron + React) into an "AI Operating System." Phase 1 extends existing capabilities rather than replacing them, and is organized around three foundational pillars:

1. **Persistent cross-session memory layer** — a durable, semantic (embedding-backed) long-term memory store that survives across sessions and conversations, extending the existing SQLite `memories` table and lexical recall.
2. **Background task scheduler** — a scheduler running in the Electron main process that executes recurring, scheduled, and deferred jobs independently of the chat UI.
3. **Local REST/WebSocket API** — a local HTTP REST and WebSocket server exposed from the Electron main process so local clients (and the renderer) can interact with LocalMind programmatically.

Privacy-first is a core product value. All three pillars must operate local-only by default, and any network-exposed surface must enforce authentication and access controls. Phase 1 must preserve backward compatibility with existing memory data and existing IPC contracts.

## Glossary

- **LocalMind**: The privacy-first Electron + React desktop application being extended.
- **Main_Process**: The Electron main (Node.js) process (`src/main`) that owns the database, LLM router, IPC handlers, and app lifecycle.
- **Renderer_Process**: The Electron renderer (React) process (`src/renderer`) that hosts the chat UI.
- **Memory_Layer**: The persistent cross-session memory subsystem defined by this spec, extending the existing `memories` table and lexical recall.
- **Memory_Record**: A single stored memory item consisting of content, kind, importance score, optional embedding vector, source conversation reference, enabled flag, and timestamps.
- **Embedding_Provider**: A component that converts text into a numeric embedding vector using a configured model (e.g., a local Ollama embedding model or a configured cloud model).
- **Semantic_Recall**: Retrieval of Memory_Records ranked by vector similarity between a query embedding and stored memory embeddings.
- **Lexical_Recall**: The existing token-overlap retrieval implemented in `src/main/agent/runtime.ts`.
- **Hybrid_Recall**: A retrieval mode that combines Semantic_Recall and Lexical_Recall results into a single ranked list.
- **Vector_Store**: The storage backend for embeddings (candidate technologies: Mem0 or LanceDB), integrated with the existing SQLite-backed persistence.
- **Scheduler**: The background task scheduler subsystem running in the Main_Process.
- **Scheduled_Task**: A unit of work registered with the Scheduler, defined by a trigger (cron expression, interval, or one-time time), a task type, and a parameter payload.
- **Task_Run**: A single execution instance of a Scheduled_Task, with a status, start time, end time, and result or error.
- **Trigger**: The timing rule that determines when a Scheduled_Task executes (cron expression, fixed interval, or one-time timestamp).
- **API_Server**: The local HTTP REST and WebSocket server exposed from the Main_Process.
- **API_Client**: Any local process (including the Renderer_Process or external local tools) that connects to the API_Server.
- **API_Token**: A secret bearer credential required to authenticate API_Client requests to the API_Server.
- **Privacy_Mode**: The existing LocalMind setting that, when enabled, restricts processing to local-only providers (Ollama).
- **App_Store**: The existing `electron-store` settings store (`src/main/settings/app-store.ts`).
- **Secrets_Store**: The existing encrypted `electron-store` for secrets (`src/main/settings/secrets.ts`).
- **IPCResponse**: The existing `{ success, data?, error? }` response wrapper produced by `safeHandle()`.
- **Loopback_Interface**: The local network interface `127.0.0.1` (and `::1`), not reachable from other machines.

## Requirements

---

## Pillar 1: Persistent Cross-Session Memory Layer

### Requirement 1: Durable Memory Persistence

**User Story:** As a LocalMind user, I want my memories to persist across application sessions and conversations, so that the assistant retains long-term knowledge of my preferences and history.

#### Acceptance Criteria

1. THE Memory_Layer SHALL store each Memory_Record in durable on-disk storage that retains all previously committed Memory_Records after the application process terminates and restarts.
2. WHEN the Main_Process writes a Memory_Record, THE Memory_Layer SHALL flush the record to on-disk storage and return the write result only after the on-disk write completes.
3. IF the on-disk write of a Memory_Record does not complete within 5 seconds, THEN THE Memory_Layer SHALL return an IPCResponse with `success` set to false and an `error` indicating a write timeout, and SHALL leave previously committed Memory_Records unchanged.
4. WHEN LocalMind starts, THE Memory_Layer SHALL load all previously committed Memory_Records from on-disk storage without requiring the user to start a new conversation.
5. WHEN the Main_Process writes a Memory_Record and a source conversation identifier is provided, THE Memory_Layer SHALL store that source conversation identifier as part of the Memory_Record.
6. IF a Memory_Record write operation fails, THEN THE Memory_Layer SHALL return an IPCResponse with `success` set to false and an `error` describing the failure, and SHALL NOT leave a partially written Memory_Record in on-disk storage.

### Requirement 2: Backward Compatibility With Existing Memory Data

**User Story:** As an existing LocalMind user, I want my current stored memories to remain available after the upgrade, so that no personal context is lost.

#### Acceptance Criteria

1. WHEN the Memory_Layer initializes, THE Memory_Layer SHALL read all existing Memory_Records from the current SQLite `memories` table such that the loaded record count and each record's field values equal the pre-upgrade state, with zero records dropped or altered.
2. IF reading existing Memory_Records from the `memories` table fails, THEN THE Memory_Layer SHALL retain the original stored data unchanged, SHALL report the read failure, and SHALL make any successfully read Memory_Records available.
3. WHERE existing Memory_Records lack an embedding vector, THE Memory_Layer SHALL return those records as candidates through Lexical_Recall.
4. WHEN LocalMind starts for the first time after the upgrade, THE Memory_Layer SHALL migrate App_Store-based long-term and short-term memories into the Memory_Layer exactly once, such that re-running startup produces no duplicate Memory_Records and the migrated record count equals the source record count.
5. IF the one-time migration is interrupted before completion, THEN THE Memory_Layer SHALL resume the migration on the next startup without creating duplicate Memory_Records.
6. WHILE a Memory_Record has no embedding vector and an Embedding_Provider is available, THE Memory_Layer SHALL generate and attach an embedding vector to that Memory_Record.
7. IF embedding generation for a backward-compatible Memory_Record fails or no Embedding_Provider is available, THEN THE Memory_Layer SHALL keep the Memory_Record retrievable through Lexical_Recall.
8. THE Memory_Layer SHALL exclude every Memory_Record whose `enabled` flag is false from recall and SHALL include every Memory_Record whose `enabled` flag is true in recall eligibility.

### Requirement 3: Semantic Embedding Generation

**User Story:** As a user, I want my memories indexed semantically, so that relevant context is recalled even when wording differs.

#### Acceptance Criteria

1. WHEN a Memory_Record is created or updated, THE Memory_Layer SHALL request an embedding vector for the record content from the configured Embedding_Provider within 2 seconds of the create or update operation completing.
2. IF the configured Embedding_Provider does not return an embedding vector within 30 seconds of the request, THEN THE Memory_Layer SHALL abort the request, SHALL persist the Memory_Record content, and SHALL record that the embedding is absent.
3. WHEN an embedding vector is generated, THE Memory_Layer SHALL store the embedding vector in the Vector_Store associated with the originating Memory_Record identifier such that the embedding vector is retrievable using that identifier.
4. IF no Embedding_Provider is configured or the configured Embedding_Provider is not reachable, THEN THE Memory_Layer SHALL store the Memory_Record content without an embedding vector and SHALL continue to service recall requests using Lexical_Recall.
5. WHILE Privacy_Mode is enabled, THE Memory_Layer SHALL use only a local Embedding_Provider for embedding generation and SHALL NOT transmit Memory_Record content to any non-local Embedding_Provider.
6. WHERE Privacy_Mode is enabled, IF no local Embedding_Provider is configured or reachable, THEN THE Memory_Layer SHALL store the Memory_Record content without an embedding vector and SHALL continue to service recall requests using Lexical_Recall.
7. IF embedding generation fails for a Memory_Record after 3 consecutive request attempts, THEN THE Memory_Layer SHALL persist the Memory_Record content, SHALL record that the embedding is absent, and SHALL remain operational using Lexical_Recall.

### Requirement 4: Semantic and Hybrid Recall

**User Story:** As a user, I want the assistant to recall the most relevant memories for my current message, so that responses are personalized and accurate.

#### Acceptance Criteria

1. WHEN the agent runtime processes a user message and the Memory_Layer contains at least one enabled Memory_Record, THE Memory_Layer SHALL return a list of relevant Memory_Records for that message ordered by descending relevance score, with ties broken by most recent Memory_Record creation timestamp first.
2. WHERE embedding vectors are available for both the query and the stored Memory_Records, THE Memory_Layer SHALL rank results using Semantic_Recall.
3. WHERE embedding vectors are unavailable for the query or the stored Memory_Records, THE Memory_Layer SHALL rank results using Lexical_Recall.
4. THE Memory_Layer SHALL limit each recall result set to a configurable maximum count in the range 1 to 50 inclusive, defaulting to 5 Memory_Records.
5. THE Memory_Layer SHALL exclude every Memory_Record whose `enabled` flag is false from all recall results.
6. WHEN embedding vectors are available for both the query and the stored Memory_Records and at least one enabled Memory_Record also matches the query lexically, THE Memory_Layer SHALL produce a Hybrid_Recall ranking that combines the semantic and lexical signals into a single ordered list sorted by descending combined relevance score.
7. IF the Memory_Layer contains no enabled Memory_Record or no enabled Memory_Record matches the user message, THEN THE Memory_Layer SHALL return an empty result list without raising an error.
8. WHEN the agent runtime requests recall for a user message, THE Memory_Layer SHALL return the recall result set within a configurable timeout, defaulting to 2000 milliseconds.

### Requirement 5: Memory Management Operations

**User Story:** As a user, I want to view, edit, enable, disable, and delete my stored memories, so that I retain control over what the assistant remembers.

#### Acceptance Criteria

1. THE Memory_Layer SHALL expose an operation that returns all stored Memory_Records, including both enabled and disabled records, and SHALL include each record's enabled/disabled status in the returned results.
2. WHEN a user requests deletion of a Memory_Record by an identifier that matches an existing record, THE Memory_Layer SHALL remove the Memory_Record and its associated embedding vector from durable storage.
3. IF a user requests deletion, update, enable, or disable of a Memory_Record by an identifier that does not match any existing record, THEN THE Memory_Layer SHALL make no change to stored Memory_Records and SHALL return an error indication that the identifier was not found.
4. WHEN a user updates the content of a Memory_Record with content that is between 1 and 10,000 characters, THE Memory_Layer SHALL persist the updated content.
5. WHEN a user updates the content of a Memory_Record and an Embedding_Provider is available, THE Memory_Layer SHALL regenerate the embedding vector for the updated content before completing the update.
6. IF a user updates the content of a Memory_Record and no Embedding_Provider is available, THEN THE Memory_Layer SHALL persist the updated content and SHALL mark the Memory_Record as requiring embedding regeneration.
7. IF a user submits updated content that is empty or exceeds 10,000 characters, THEN THE Memory_Layer SHALL reject the update, SHALL retain the existing content unchanged, and SHALL return an error indication describing the content length violation.
8. WHEN a user disables a Memory_Record, THE Memory_Layer SHALL retain the Memory_Record in storage and SHALL exclude the record from all recall results produced after the disable operation completes.
9. WHEN a user enables a previously disabled Memory_Record, THE Memory_Layer SHALL include the record in all recall results produced after the enable operation completes.

---

## Pillar 2: Background Task Scheduler

### Requirement 6: Task Registration and Persistence

**User Story:** As a user, I want to schedule background tasks, so that LocalMind can perform work for me on a recurring or deferred basis.

#### Acceptance Criteria

1. WHEN an API_Client or the Renderer_Process registers a Scheduled_Task with a valid Trigger and task type, THE Scheduler SHALL store the Scheduled_Task in durable on-disk storage and SHALL return the assigned unique identifier within 2 seconds.
2. THE Scheduler SHALL support a standard 5-field cron-expression Trigger, a fixed-interval Trigger with an interval between 1 and 31,536,000 seconds inclusive, and a one-time timestamp Trigger.
3. IF a Scheduled_Task is registered with an invalid Trigger definition or a missing task type, THEN THE Scheduler SHALL reject the registration, SHALL NOT store any partial Scheduled_Task, and SHALL return an error identifying the invalid field.
4. WHEN LocalMind starts, THE Scheduler SHALL load all previously registered Scheduled_Tasks from durable storage and SHALL resume their schedules.
5. THE Scheduler SHALL assign each registered Scheduled_Task a unique identifier that remains unique across application restarts and is not reused after a Scheduled_Task is removed.

### Requirement 7: Task Execution

**User Story:** As a user, I want scheduled tasks to run reliably in the background, so that work happens without the chat UI being open or focused.

#### Acceptance Criteria

1. WHEN a Scheduled_Task Trigger time is reached, THE Scheduler SHALL begin executing the Scheduled_Task in the Main_Process within 5 seconds of the Trigger time, independently of the Renderer_Process state (running, suspended, or terminated).
2. WHILE the Renderer_Process window is closed, minimized, or hidden, THE Scheduler SHALL continue evaluating Triggers at an interval not exceeding 60 seconds and SHALL execute each due Scheduled_Task.
3. WHEN a Scheduled_Task execution completes, THE Scheduler SHALL create a Task_Run record capturing start time, end time, and a completion status equal to one of exactly two values: succeeded or failed.
4. IF a Scheduled_Task execution throws an error, THEN THE Scheduler SHALL record the Task_Run status as failed with an error description identifying the failure cause, SHALL preserve all previously created Task_Run records, and SHALL continue evaluating other Scheduled_Tasks without interruption.
5. IF a one-time Scheduled_Task has already produced a Task_Run record, THEN THE Scheduler SHALL NOT execute that Scheduled_Task again.
6. WHEN two or more Scheduled_Tasks become due within the same evaluation cycle, THE Scheduler SHALL execute each due Scheduled_Task and SHALL create a separate Task_Run record for each, such that a failure of one Scheduled_Task does not prevent execution of the remaining due Scheduled_Tasks.
7. WHEN the Main_Process starts and detects a Scheduled_Task whose Trigger time elapsed while the Main_Process was not running, THE Scheduler SHALL execute that Scheduled_Task within 5 seconds of detection and create a Task_Run record.

### Requirement 8: Task Lifecycle Management

**User Story:** As a user, I want to enable, disable, update, and remove scheduled tasks, so that I can manage automated work over time.

#### Acceptance Criteria

1. WHEN a user requests the list of Scheduled_Tasks, THE Scheduler SHALL return all registered Scheduled_Tasks, each with its identifier, enabled/disabled state, Trigger definition, and the status of its most recent Task_Run (one of: not-yet-run, running, succeeded, failed), within 2 seconds.
2. WHEN a user disables a Scheduled_Task by identifier, THE Scheduler SHALL set the Scheduled_Task state to disabled, retain the complete Scheduled_Task definition and all existing Task_Run records, and SHALL NOT start any new Task_Run for that Scheduled_Task until it is re-enabled.
3. WHEN a user re-enables a previously disabled Scheduled_Task, THE Scheduler SHALL set the Scheduled_Task state to enabled and resume evaluating its Trigger for subsequent executions.
4. WHEN a user removes a Scheduled_Task by identifier, THE Scheduler SHALL delete the Scheduled_Task definition, cancel any pending Trigger for that Scheduled_Task, and reject any in-progress Task_Run for that Scheduled_Task from being recorded as succeeded.
5. IF a user requests to disable, re-enable, update, or remove a Scheduled_Task using an identifier that does not match any registered Scheduled_Task, THEN THE Scheduler SHALL reject the operation, leave all existing Scheduled_Tasks and Task_Run records unchanged, and return an error indicating the identifier was not found.
6. WHEN a user updates the Trigger of a Scheduled_Task, THE Scheduler SHALL validate the new Trigger, and upon successful validation apply the new Trigger to all subsequent executions without altering any in-progress or completed Task_Run records.
7. IF a user submits an invalid Trigger when updating a Scheduled_Task, THEN THE Scheduler SHALL reject the update, retain the existing Trigger, and return an error indicating the Trigger is invalid.
8. WHEN the application is shutting down, THE Scheduler SHALL persist the current state of all Scheduled_Tasks and all Task_Run records to durable storage before the Main_Process exits, and SHALL complete this persistence within 5 seconds.

---

## Pillar 3: Local REST/WebSocket API

### Requirement 9: Local API Server Lifecycle

**User Story:** As a developer, I want LocalMind to expose a local API server, so that local clients can interact with LocalMind programmatically.

#### Acceptance Criteria

1. WHERE the local API feature is enabled in settings, THE API_Server SHALL bind and begin listening on the Loopback_Interface within 10 seconds of Main_Process startup completing.
2. THE API_Server SHALL bind exclusively to the Loopback_Interface address and SHALL NOT bind to any externally routable network interface.
3. WHEN the API_Server begins listening successfully, THE API_Server SHALL record the bound host and port in a location readable by the Renderer_Process within 1 second of beginning to listen.
4. IF the configured port is already in use, THEN THE API_Server SHALL abort its own startup, SHALL report a startup error identifying the port conflict, and SHALL leave all other LocalMind functionality operational.
5. IF the configured port is outside the range 1024 to 65535 inclusive, THEN THE API_Server SHALL reject the configuration, SHALL report a configuration error indicating the invalid port value, and SHALL NOT bind to any network interface.
6. WHEN the application begins shutting down, THE API_Server SHALL stop accepting new connections immediately, SHALL wait for in-flight requests to complete for up to 5 seconds before force-closing remaining connections, and SHALL release the bound port before the Main_Process exits.
7. WHERE the local API feature is disabled in settings, THE API_Server SHALL NOT bind to or listen on any network interface, including the Loopback_Interface.

### Requirement 10: API Authentication and Access Control

**User Story:** As a privacy-conscious user, I want every API request to be authenticated, so that no unauthorized local or network client can access my data.

#### Acceptance Criteria

1. THE API_Server SHALL require an API_Token that exactly matches the API_Token held in the Secrets_Store on every REST request and every WebSocket connection handshake before performing any requested operation.
2. IF a REST request omits an API_Token or presents an API_Token that does not match the API_Token in the Secrets_Store, THEN THE API_Server SHALL reject the request with an HTTP 401 status, SHALL return an error response indicating that authentication is required or failed, and SHALL NOT perform the requested operation.
3. IF a WebSocket connection handshake omits an API_Token or presents an API_Token that does not match the API_Token in the Secrets_Store, THEN THE API_Server SHALL reject the connection with an HTTP 401 status and SHALL NOT establish the connection.
4. THE API_Server SHALL store the API_Token only in the Secrets_Store and SHALL NOT return the API_Token in any error response.
5. WHEN a user requests regeneration of the API_Token, THE API_Server SHALL generate a new API_Token of at least 32 characters, SHALL replace the previous API_Token in the Secrets_Store, and SHALL invalidate the previous API_Token within 1 second of the regeneration request completing.
6. WHEN the previous API_Token has been invalidated through regeneration, THE API_Server SHALL reject any subsequent REST request or WebSocket connection presenting the previous API_Token with an HTTP 401 status.
7. WHERE a cross-origin request is received, IF the request origin is not present in the allow-list configured in settings, THEN THE API_Server SHALL reject the request with an HTTP 403 status and SHALL NOT perform the requested operation.
8. IF a request payload is malformed or fails schema validation, THEN THE API_Server SHALL reject the request with an HTTP 400 status, SHALL return an error response identifying the validation failure, and SHALL NOT perform the requested operation.

### Requirement 11: REST Endpoints

**User Story:** As a developer, I want REST endpoints for core LocalMind capabilities, so that I can drive conversations, memory, and tasks from local tools.

#### Acceptance Criteria

1. WHEN an authenticated API_Client requests a chat completion through the REST API, THE API_Server SHALL route the request through the existing LLM router and SHALL return the generated response in the IPCResponse shape with `success` set to true.
2. WHILE Privacy_Mode is enabled, IF an API_Client request would route to a non-Ollama provider, THEN THE API_Server SHALL reject the request without invoking that provider and SHALL return an IPCResponse with `success` set to false and an `error` value indicating the provider is blocked by Privacy_Mode.
3. WHEN an authenticated API_Client requests a memory list, create, update, or delete operation through the REST API, THE API_Server SHALL invoke the corresponding Memory_Layer operation and SHALL return its result in the IPCResponse shape with `success` set to true.
4. WHEN an authenticated API_Client requests a scheduler registration, listing, or removal operation through the REST API, THE API_Server SHALL invoke the corresponding Scheduler operation and SHALL return its result in the IPCResponse shape with `success` set to true.
5. THE API_Server SHALL return every REST response as an IPCResponse object containing a boolean `success` field, a `data` field present when `success` is true, and an `error` field present when `success` is false.
6. IF an API_Client request to any REST endpoint lacks valid authentication, THEN THE API_Server SHALL reject the request without invoking the LLM router, Memory_Layer, or Scheduler, and SHALL return an IPCResponse with `success` set to false and an `error` value indicating authentication failure.
7. IF an invoked LLM router, Memory_Layer, or Scheduler operation fails or receives invalid input, THEN THE API_Server SHALL return an IPCResponse with `success` set to false and an `error` value indicating the failure, and SHALL leave the underlying stored data unchanged.

### Requirement 12: WebSocket Streaming

**User Story:** As a developer, I want streaming responses over WebSocket, so that I can receive incremental LLM output the same way the chat UI does.

#### Acceptance Criteria

1. WHEN an authenticated API_Client initiates a streaming chat request over WebSocket, THE API_Server SHALL send incremental response chunks to the API_Client in production order, each tagged with the request's stream identifier.
2. WHEN the API_Server accepts a streaming chat request, THE API_Server SHALL send the first response chunk within 30 seconds of acceptance and SHALL send each subsequent chunk within 30 seconds of its production.
3. IF an API_Client initiates a streaming chat request without valid authentication, THEN THE API_Server SHALL reject the request, SHALL NOT send any response chunk, and SHALL close the stream.
4. WHEN a streaming response completes, THE API_Server SHALL send a completion event including prompt, completion, and total token counts to the API_Client and SHALL close the stream.
5. IF an error occurs during a streaming response, THEN THE API_Server SHALL send an error event indicating the failure to the API_Client and SHALL close the stream for that request.
6. WHEN an API_Client cancels an in-progress streaming request, THE API_Server SHALL stop sending further chunks for that request within 5 seconds and SHALL close the stream.
7. IF a WebSocket connection is lost during a streaming response, THEN THE API_Server SHALL abort the associated generation within 30 seconds of detecting the connection loss.

---

## Non-Functional Requirements

### Requirement 13: Privacy

**User Story:** As a privacy-first user, I want all foundation features to operate locally by default, so that my data never leaves my machine without my consent.

#### Acceptance Criteria

1. THE Memory_Layer SHALL store all Memory_Records and embedding vectors on the local device only.
2. THE API_Server SHALL bind only to the Loopback_Interface unless a user explicitly enables non-loopback binding in settings.
3. WHILE Privacy_Mode is enabled, THE Memory_Layer and THE API_Server SHALL route all model inference and embedding generation through local providers only.
4. THE Scheduler SHALL execute Scheduled_Tasks using the same provider and Privacy_Mode restrictions enforced for interactive chat.

### Requirement 14: Security

**User Story:** As a user, I want the local API and stored secrets protected, so that the new attack surface does not expose my data.

#### Acceptance Criteria

1. THE API_Server SHALL store the API_Token only in the Secrets_Store and SHALL NOT write the API_Token to application logs.
2. THE Memory_Layer SHALL exclude secret values such as API keys, passwords, and one-time codes from stored Memory_Records.
3. IF an API request exceeds a configured rate limit, THEN THE API_Server SHALL reject additional requests from that API_Client with an HTTP 429 status until the limit window resets.
4. THE API_Server SHALL reject request payloads larger than a configured maximum size with an HTTP 413 status.

### Requirement 15: Performance

**User Story:** As a user, I want the foundation features to be responsive, so that background work and recall do not degrade the chat experience.

#### Acceptance Criteria

1. WHEN the Memory_Layer performs Semantic_Recall over a store of up to 10,000 Memory_Records, THE Memory_Layer SHALL return ranked results within 500 milliseconds.
2. THE Memory_Layer SHALL generate and persist embeddings asynchronously so that interactive chat streaming is not blocked.
3. WHEN the Scheduler evaluates Triggers, THE Scheduler SHALL perform evaluation without blocking the Main_Process IPC handlers.
4. WHEN an authenticated REST request is received for a non-LLM operation, THE API_Server SHALL begin processing the request within 100 milliseconds under nominal load.

### Requirement 16: Persistence and Durability

**User Story:** As a user, I want memory, tasks, and their state to survive crashes and restarts, so that the AI OS foundation is reliable.

#### Acceptance Criteria

1. THE Memory_Layer, THE Scheduler, and THE API_Server configuration SHALL store state in durable on-disk storage under the application user-data directory.
2. WHEN a write to durable storage completes, THE owning subsystem SHALL guarantee the written state is recoverable after an unexpected restart.
3. IF durable storage is corrupted or unreadable at startup, THEN the affected subsystem SHALL report the failure and SHALL allow the remainder of LocalMind to start.
4. THE Scheduler SHALL persist Task_Run history and SHALL retain Task_Run records according to a configurable retention period.

### Requirement 17: Backward Compatibility With Existing Contracts

**User Story:** As an existing user, I want current functionality to keep working, so that the upgrade introduces no regressions.

#### Acceptance Criteria

1. THE Memory_Layer SHALL preserve the existing IPC memory contracts so that the current Renderer_Process continues to function without modification.
2. THE existing lexical recall behavior in the agent runtime SHALL remain available as a fallback when Semantic_Recall is unavailable.
3. WHERE the new foundation features are disabled in settings, THE existing chat, conversation, and settings behavior SHALL operate unchanged.
4. THE Memory_Layer SHALL continue to use the existing database persistence mechanism so that existing tables and data remain intact.
