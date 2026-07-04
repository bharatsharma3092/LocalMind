# LocalMind Dev Agent Platform -- TRD

**Version:** 1.0  
**Date:** June 10, 2026  
**Author:** Bharat Sharma  
**Status:** Draft  
**Companion PRD:** LocalMind_Dev_Agent_Platform_PRD.md

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Technology Stack](#2-technology-stack)
3. [Data Models & Storage](#3-data-models--storage)
4. [API Design](#4-api-design)
5. [Core Services](#5-core-services)
6. [Integration Patterns](#6-integration-patterns)
7. [Security Architecture](#7-security-architecture)
8. [Performance & Scalability](#8-performance--scalability)
9. [Deployment Architecture](#9-deployment-architecture)
10. [Implementation Roadmap](#10-implementation-roadmap)

---

## 1. System Architecture

### 1.1 High-Level Architecture

LocalMind follows a modular service-oriented architecture with clear separation between the UI layer, orchestration engine, tool runtime, model gateway, and persistence layer.

```
+------------------+------------------+------------------+
|  Desktop App     |  Terminal/CLI    |  VS Code Ext     |
|  (Electron)      |  (Node.js)       |  (TypeScript)    |
+--------+---------+--------+---------+--------+---------+
         |                  |                  |
         +------------------+------------------+
                            |
              +-------------+-------------+
              |   WebSocket Gateway       |
              |   (Real-time Sync)        |
              +-------------+-------------+
                            |
+---------------------------+---------------------------+
|                  LOCALMIND CORE ENGINE                |
|                                                         |
|  +-----------+  +-----------+  +-----------+          |
|  | Session   |  | Agent     |  | Skill     |          |
|  | Manager   |  |Orchestrator|  | Engine   |          |
|  +-----+-----+  +-----+-----+  +-----+-----+          |
|        |              |              |                 |
|  +-----+-----+  +-----+-----+  +-----+-----+          |
|  | Memory    |  | Tool      |  | Permission|          |
|  | Service   |  | Runtime   |  | Engine    |          |
|  +-----+-----+  +-----+-----+  +-----+-----+          |
|        |              |              |                 |
+------------------------+------------------------------+
                         |
              +----------+----------+
              |    Model Gateway    |
              |   (Multi-Provider)  |
              +----------+----------+
                         |
+------------------------+---------------------------+
|              EXTERNAL INTEGRATIONS                 |
|  +--------+  +--------+  +--------+  +--------+   |
|  | OpenAI |  | Gemini |  | Ollama |  |  MCP   |   |
|  |Compat. |  |  API   |  |Local/  |  |Servers |   |
|  +--------+  +--------+  | Cloud  |  +--------+   |
|                         +--------+                 |
+----------------------------------------------------+
```

### 1.2 Component Responsibilities

| Component | Responsibility | Technology |
|---|---|---|
| **UI Surfaces** | User interaction layers | Electron (desktop), Node.js (CLI), VS Code Extension API |
| **WebSocket Gateway** | Real-time sync across surfaces | Socket.io or native WebSocket |
| **Session Manager** | Session lifecycle, context tracking, state machine | TypeScript / Node.js |
| **Agent Orchestrator** | Plan generation, task decomposition, agent dispatch | TypeScript / Python |
| **Skill Engine** | Skill loading, invocation, and execution | Markdown parser + TypeScript runtime |
| **Memory Service** | Memory storage, retrieval, and indexing | SQLite + optional vector DB |
| **Tool Runtime** | Tool execution, sandboxing, and output capture | TypeScript + Python subprocess |
| **Permission Engine** | Policy evaluation and enforcement | Rule engine (json-rules-engine) |
| **Model Gateway** | Provider abstraction, routing, and fallback | TypeScript with provider adapters |
| **MCP Client** | MCP server connection and tool invocation | TypeScript (MCP SDK) |
| **Scheduler** | Cron jobs, background tasks, and triggers | node-cron + bullmq |

---

## 2. Technology Stack

### 2.1 Core Runtime

| Layer | Technology | Rationale |
|---|---|---|
| **Runtime** | Node.js 20+ (LTS) | Existing LocalMind base, rich ecosystem, async I/O |
| **Language** | TypeScript 5.3+ | Type safety, excellent tooling, Bharat's comfort zone |
| **Process Manager** | PM2 / systemd | Background agent daemon management |
| **Shell Execution** | node-pty | Pseudo-terminal for interactive shell sessions |
| **File Watching** | chokidar | Cross-platform file system monitoring |

### 2.2 UI Layer

| Surface | Technology | Rationale |
|---|---|---|
| **Desktop App** | Electron 30+ | Existing LocalMind foundation, cross-platform |
| **Terminal** | Ink (React for CLI) or native Node.js readline | Rich terminal UI with React components |
| **VS Code Extension** | VS Code Extension API + Webview | Native IDE integration |
| **Web Companion** | React 18 + Vite | Fast, modern web UI for remote access |

### 2.3 Data & Storage

| Purpose | Technology | Rationale |
|---|---|---|
| **Primary DB** | SQLite (better-sqlite3) | Zero-config, file-based, perfect for local-first |
| **Vector Store** | ChromaDB (local) or Qdrant | Semantic code search and memory retrieval |
| **Cache** | Node-cache / LRU | Fast in-memory session and tool result caching |
| **File Storage** | Local filesystem + structured paths | Repo maps, execution logs, artifacts |
| **Config** | YAML + JSON | Human-readable project and user configs |

### 2.4 AI/ML Layer

| Component | Technology | Rationale |
|---|---|---|
| **LLM Gateway** | Custom abstraction layer | Multi-provider unification |
| **OpenAI Compatible** | openai-node SDK | Standard API for dozens of providers |
| **Gemini** | @google/generative-ai | First-party Google integration |
| **Ollama** | ollama-js or fetch | Local model execution |
| **Embeddings** | Local: Ollama embeddings; Cloud: OpenAI/text-embedding-3 | Semantic search and memory |
| **Token Counting** | tiktoken (JS port) | Cost tracking and context management |

### 2.5 Tool & Integration Layer

| Component | Technology | Rationale |
|---|---|---|
| **MCP Client** | @anthropic-ai/mcp (official SDK) | Standard MCP protocol implementation |
| **LSP Client** | vscode-languageserver-protocol | Industry-standard language intelligence |
| **Git Operations** | simple-git | Pure JS Git wrapper |
| **Shell Execution** | execa + node-pty | Safe subprocess management |
| **Browser Automation** | Playwright MCP server | External process via MCP |
| **Web Scraping** | cheerio + fetch | Lightweight HTML parsing |
| **Pattern Matching** | fast-glob + ripgrep (rg) wrapper | Fast file and content search |

### 2.6 Infrastructure

| Component | Technology | Rationale |
|---|---|---|
| **Scheduling** | bullmq (Redis-backed) or node-cron | Job queues and cron scheduling |
| **Background Jobs** | worker threads + bullmq | Non-blocking agent execution |
| **Real-time Sync** | Socket.io | Cross-surface session state sync |
| **Authentication** | Keytar + OS keychain | Secure credential storage |
| **Secrets Vault** | OS keychain (keytar) + encrypted file fallback | Local-first secret management |

---

## 3. Data Models & Storage

### 3.1 Core Entities

#### Project
```typescript
interface Project {
  id: string;                    // UUID
  path: string;                  // Absolute filesystem path
  name: string;
  detectedStack: string[];       // ['typescript', 'node', 'jest']
  localmindMdPath: string;       // Path to LOCALMIND.md
  rulesPath: string;             // .localmind/rules/
  createdAt: Date;
  lastOpenedAt: Date;
  memory: ProjectMemory;
}
```

#### Session
```typescript
interface Session {
  id: string;                    // UUID
  projectId: string;
  mode: 'ask' | 'plan' | 'build' | 'review' | 'autonomous';
  status: 'active' | 'paused' | 'completed' | 'failed';
  modelPolicy: ModelPolicy;
  context: SessionContext;
  executionLog: ExecutionStep[];
  createdAt: Date;
  updatedAt: Date;
}
```

#### ExecutionStep
```typescript
interface ExecutionStep {
  id: string;
  sessionId: string;
  type: 'thought' | 'tool_call' | 'tool_result' | 'approval_request' | 'user_input' | 'checkpoint';
  content: string;
  toolName?: string;
  toolInput?: Record<string, any>;
  toolOutput?: any;
  approvalStatus?: 'pending' | 'approved' | 'denied';
  cost?: { tokens: number; model: string; estimatedCost: number };
  timestamp: Date;
  parentStepId?: string;         // For hierarchical plans
}
```

#### Memory Entry
```typescript
interface MemoryEntry {
  id: string;
  projectId?: string;            // null = user-global
  sessionId?: string;            // null = persistent
  type: 'instruction' | 'learned' | 'preference' | 'rule';
  category: string;              // 'build_command', 'debug_finding', 'style_guide'
  content: string;
  embedding?: number[];          // For semantic search
  source: 'user' | 'auto' | 'imported';
  confidence: number;            // 0-1, for auto-learned memories
  createdAt: Date;
  updatedAt: Date;
}
```

#### Skill
```typescript
interface Skill {
  id: string;
  name: string;
  description: string;
  type: 'knowledge' | 'action';
  format: 'markdown' | 'yaml';
  content: string;               // Raw skill content
  invocationPattern?: string;    // Regex for slash command
  autoInvokable: boolean;
  permissions: string[];         // Required tool permissions
  dependencies: string[];        // Other skill IDs
  source: 'local' | 'marketplace' | 'custom';
  version: string;
}
```

#### Agent (Subagent / Team Member)
```typescript
interface Agent {
  id: string;
  sessionId: string;
  name: string;
  role: 'planner' | 'explorer' | 'implementer' | 'tester' | 'reviewer' | 'security' | 'docs';
  modelPolicy: ModelPolicy;
  contextBudget: { maxTokens: number; maxFiles: number };
  taskQueue: Task[];
  status: 'idle' | 'working' | 'blocked' | 'completed';
  parentAgentId?: string;        // For subagent hierarchy
  messages: AgentMessage[];
}
```

#### Tool Manifest
```typescript
interface ToolManifest {
  name: string;
  description: string;
  version: string;
  inputSchema: JSONSchema;
  outputSchema?: JSONSchema;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  requiresApproval: boolean;
  sandboxConfig?: SandboxConfig;
  examples: ToolExample[];
}
```

### 3.2 Database Schema (SQLite)

```sql
-- Projects table
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  detected_stack TEXT, -- JSON array
  localmind_md_path TEXT,
  rules_path TEXT,
  created_at INTEGER,
  last_opened_at INTEGER
);

-- Sessions table
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id),
  mode TEXT CHECK(mode IN ('ask', 'plan', 'build', 'review', 'autonomous')),
  status TEXT CHECK(status IN ('active', 'paused', 'completed', 'failed')),
  model_policy TEXT, -- JSON
  context TEXT, -- JSON
  created_at INTEGER,
  updated_at INTEGER
);

-- Execution log
CREATE TABLE execution_steps (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES sessions(id),
  type TEXT,
  content TEXT,
  tool_name TEXT,
  tool_input TEXT, -- JSON
  tool_output TEXT, -- JSON
  approval_status TEXT,
  cost TEXT, -- JSON
  timestamp INTEGER,
  parent_step_id TEXT
);

-- Memory
CREATE TABLE memories (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  session_id TEXT,
  type TEXT,
  category TEXT,
  content TEXT,
  embedding BLOB, -- Serialized float array
  source TEXT,
  confidence REAL,
  created_at INTEGER,
  updated_at INTEGER
);

-- Skills
CREATE TABLE skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT,
  format TEXT,
  content TEXT,
  invocation_pattern TEXT,
  auto_invokable INTEGER,
  permissions TEXT, -- JSON array
  dependencies TEXT, -- JSON array
  source TEXT,
  version TEXT
);

-- Agents
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES sessions(id),
  name TEXT,
  role TEXT,
  model_policy TEXT, -- JSON
  context_budget TEXT, -- JSON
  status TEXT,
  parent_agent_id TEXT
);

-- Permissions audit log
CREATE TABLE permission_audit (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  tool_name TEXT,
  action TEXT,
  policy_mode TEXT,
  decision TEXT,
  reason TEXT,
  timestamp INTEGER
);

-- Scheduled jobs
CREATE TABLE scheduled_jobs (
  id TEXT PRIMARY KEY,
  name TEXT,
  trigger_type TEXT,
  trigger_config TEXT, -- JSON
  skill_id TEXT,
  model_policy TEXT, -- JSON
  status TEXT,
  last_run_at INTEGER,
  next_run_at INTEGER,
  run_count INTEGER,
  failure_count INTEGER
);
```

---

## 4. API Design

### 4.1 Internal API (Core Engine)

All internal services communicate via an event bus and typed function calls.

```typescript
// Core Engine Interface
interface LocalMindEngine {
  // Project management
  openProject(path: string): Promise<Project>;
  scanProject(projectId: string): Promise<RepoMap>;
  closeProject(projectId: string): Promise<void>;

  // Session management
  createSession(projectId: string, config: SessionConfig): Promise<Session>;
  sendMessage(sessionId: string, message: UserMessage): Promise<AgentResponse>;
  switchMode(sessionId: string, mode: SessionMode): Promise<void>;
  exportSession(sessionId: string): Promise<SessionExport>;

  // Tool execution
  executeTool(sessionId: string, toolCall: ToolCall): Promise<ToolResult>;
  requestApproval(sessionId: string, action: ActionRequest): Promise<ApprovalDecision>;

  // Agent orchestration
  spawnSubagent(sessionId: string, config: AgentConfig): Promise<Agent>;
  createAgentTeam(sessionId: string, config: TeamConfig): Promise<AgentTeam>;
  sendAgentMessage(from: string, to: string, message: AgentMessage): Promise<void>;

  // Memory
  getMemories(query: MemoryQuery): Promise<MemoryEntry[]>;
  addMemory(entry: MemoryEntry): Promise<void>;
  promoteMemory(sessionMemoryId: string): Promise<void>;

  // Skills
  loadSkill(skillId: string): Promise<Skill>;
  invokeSkill(sessionId: string, skillId: string, params: any): Promise<any>;
  listSkills(): Promise<Skill[]>;

  // Scheduling
  scheduleJob(config: JobConfig): Promise<ScheduledJob>;
  cancelJob(jobId: string): Promise<void>;
  listJobs(): Promise<ScheduledJob[]>;

  // Model gateway
  chat(request: ChatRequest): Promise<ChatResponse>;
  routeModel(taskType: string, policy: ModelPolicy): Promise<ModelConfig>;
}
```

### 4.2 WebSocket Events (Real-time)

```typescript
// Client -> Server
interface ClientEvents {
  'session:create': { projectId: string; config: SessionConfig };
  'session:message': { sessionId: string; message: string };
  'session:mode:switch': { sessionId: string; mode: SessionMode };
  'tool:approve': { sessionId: string; stepId: string; decision: 'approve' | 'deny' };
  'agent:interrupt': { sessionId: string; agentId: string };
}

// Server -> Client
interface ServerEvents {
  'session:created': { session: Session };
  'step:added': { step: ExecutionStep };
  'step:updated': { step: ExecutionStep };
  'approval:requested': { sessionId: string; stepId: string; action: ActionRequest };
  'agent:status': { sessionId: string; agentId: string; status: AgentStatus };
  'session:completed': { sessionId: string; summary: SessionSummary };
  'error': { sessionId: string; error: ErrorDetails };
}
```

### 4.3 MCP Integration API

```typescript
interface MCPClient {
  connect(serverConfig: MCPServerConfig): Promise<MCPConnection>;
  listTools(connectionId: string): Promise<ToolManifest[]>;
  callTool(connectionId: string, toolName: string, input: any): Promise<ToolResult>;
  disconnect(connectionId: string): Promise<void>;
  healthCheck(connectionId: string): Promise<HealthStatus>;
}

interface MCPServerConfig {
  id: string;
  name: string;
  transport: 'stdio' | 'http' | 'websocket';
  command?: string;              // For stdio transport
  args?: string[];
  env?: Record<string, string>;
  url?: string;                // For HTTP/WebSocket
  auth?: { type: 'bearer' | 'apikey'; token: string };
}
```

### 4.4 Model Gateway API

```typescript
interface ModelGateway {
  // Provider registration
  registerProvider(config: ProviderConfig): void;

  // Chat completion with routing
  chat(request: ChatRequest): Promise<ChatResponse>;

  // Streaming
  chatStream(request: ChatRequest): AsyncIterable<ChatChunk>;

  // Embeddings
  embed(text: string, provider?: string): Promise<number[]>;

  // Cost tracking
  getUsageStats(sessionId?: string): Promise<UsageReport>;
}

interface ChatRequest {
  messages: Message[];
  model?: string;              // Specific model override
  taskType?: string;           // For auto-routing
  policy?: ModelPolicy;        // Routing policy
  temperature?: number;
  maxTokens?: number;
  tools?: ToolManifest[];      // Available tools for this call
}

interface ModelPolicy {
  primaryProvider: string;     // 'openai', 'gemini', 'ollama'
  fallbackProviders: string[];
  preferredModels: Record<string, string>; // taskType -> model
  costLimit?: number;          // Max $ per session
  localFirst: boolean;        // Prefer Ollama when available
}
```

---

## 5. Core Services

### 5.1 Session Manager

**Responsibilities:**
- Session lifecycle (create, pause, resume, complete, fail)
- Context window management and token budgeting
- Mode transitions (Ask -> Plan -> Build -> Review -> Autonomous)
- Execution log persistence
- Real-time state sync across UI surfaces

**Key Implementation Details:**
- Each session has a **context window budget** tracked per message
- **Checkpoint system**: before any write operation, snapshot affected files to `.localmind/checkpoints/{sessionId}/{timestamp}/`
- **Undo/Redo**: restore from checkpoints, not git reversions (works even without git)
- **Execution journal**: append-only log in SQLite + JSON export option

### 5.2 Agent Orchestrator

**Responsibilities:**
- Parse user intent and select execution strategy
- Decompose goals into task graphs
- Dispatch subagents and monitor progress
- Coordinate agent teams via shared task board
- Handle failure recovery and retry logic

**State Machine:**

```
[Idle] -> [Planning] -> [Approving] -> [Executing] -> [Reviewing] -> [Completed]
              |              |            |            |
           [Ask Mode]   [Deny]      [Error]      [Fix Needed]
              |              |            |            |
           [Planning]   [Planning]  [Retry]      [Executing]
```

**Task Graph Structure:**
```typescript
interface TaskGraph {
  id: string;
  rootTask: Task;
  tasks: Map<string, Task>;
  edges: TaskEdge[];           // Dependencies
}

interface Task {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'blocked';
  assignedAgent?: string;
  parentTaskId?: string;
  dependencies: string[];
  estimatedTokens: number;
  actualTokens?: number;
  result?: any;
  error?: ErrorDetails;
}
```

### 5.3 Tool Runtime

**Responsibilities:**
- Tool discovery and loading (built-in + MCP + custom)
- Schema validation (input/output)
- Permission evaluation before execution
- Sandbox execution for risky tools
- Result formatting and streaming

**Execution Flow:**
```
1. Parse tool call from LLM response
2. Validate input against JSON schema
3. Evaluate permissions (policy + risk level + path protections)
4. If approval needed -> queue for user decision
5. If approved -> execute in appropriate sandbox
6. Capture output (stdout, stderr, files changed, network calls)
7. Format result for LLM context
8. Log execution to audit trail
```

**Sandbox Levels:**

| Level | Description | Tools |
|---|---|---|
| **None** | Direct execution | Read-only tools, safe searches |
| **Restricted** | Subprocess with env restrictions | File writes, git operations |
| **Isolated** | Docker/container or temp directory | Shell commands, package installs |
| **Network Guarded** | Network proxy + allowlist | Web fetch, API calls |

### 5.4 Memory Service

**Responsibilities:**
- CRUD for all memory tiers
- Semantic search via embeddings
- Memory promotion (session -> persistent)
- Import from CLAUDE.md / AGENTS.md
- Auto-memory generation from execution patterns

**Memory Retrieval Strategy:**
```typescript
interface MemoryQuery {
  projectId?: string;
  sessionId?: string;
  type?: MemoryType;
  category?: string;
  textQuery?: string;          // For semantic search
  recency?: number;            // Days back
  limit: number;
}

async function retrieveMemories(query: MemoryQuery): Promise<MemoryEntry[]> {
  // 1. Fetch explicit instructions (LOCALMIND.md, rules)
  // 2. Search semantic memories by embedding similarity
  // 3. Filter by recency and relevance
  // 4. Rank by confidence and source priority
  // 5. Return top N within context budget
}
```

### 5.5 Skill Engine

**Responsibilities:**
- Parse skill files (Markdown + YAML frontmatter)
- Register slash commands
- Resolve dependencies
- Inject skill context into agent prompts
- Validate skill permissions

**Skill File Format:**
```markdown
---
name: generate-tests
version: 1.0.0
type: action
invocation: /generate-tests
auto_invokable: false
permissions:
  - read_file
  - write_file
  - test_runner
dependencies: []
---

# Generate Tests

When invoked, analyze the selected code and generate comprehensive tests.

## Context Rules
- Prefer Jest for JavaScript/TypeScript
- Use pytest for Python
- Include edge cases and error paths
- Mock external dependencies
```

### 5.6 Permission Engine

**Responsibilities:**
- Evaluate tool calls against active policy
- Path protection rules
- Secret file guards
- Rate limiting
- Audit logging

**Policy Evaluation:**
```typescript
interface PolicyRule {
  tool: string;                // Tool name or wildcard
  action: 'allow' | 'deny' | 'ask';
  conditions?: {
    path?: string[];           // Allowed/protected paths
    networkHosts?: string[];   // Network allowlist
    rateLimit?: number;        // Calls per minute
    requiresConfirmation?: boolean;
  };
}

function evaluatePermission(
  toolCall: ToolCall,
  policy: PolicyConfig,
  session: Session
): PermissionDecision {
  // 1. Check tool-specific policy
  // 2. Check path protections
  // 3. Check rate limits
  // 4. Check risk level vs policy mode
  // 5. Return decision + reason
}
```

### 5.7 Model Gateway

**Responsibilities:**
- Abstract all LLM providers behind unified interface
- Intelligent routing based on task type
- Fallback handling
- Token counting and cost tracking
- Streaming support

**Routing Logic:**
```typescript
function routeModel(taskType: string, policy: ModelPolicy): ModelConfig {
  // Priority order:
  // 1. User-specified model for this task
  // 2. Policy.preferredModels[taskType]
  // 3. Policy.primaryProvider with default model
  // 4. Fallback providers in order
  // 5. If localFirst and Ollama available -> use Ollama for read-only tasks
}
```

**Task Type -> Model Mapping (Default):**

| Task Type | Default Model Strategy |
|---|---|
| explore | Cheapest/fastest available (Ollama 7B if local) |
| search | Fast embed-capable model |
| plan | Mid-tier reasoning model |
| implement | Strongest coding model available |
| review | Strong reasoning model (different from implementer) |
| test | Fast, deterministic model |
| debug | Strong reasoning + context model |

---

## 6. Integration Patterns

### 6.1 MCP Server Integration

```typescript
// MCP Server lifecycle
class MCPServerManager {
  private connections: Map<string, MCPConnection> = new Map();

  async installServer(config: MCPServerConfig): Promise<void> {
    // 1. Validate config
    // 2. Start server process (stdio) or connect (http/ws)
    // 3. Perform handshake
    // 4. List tools and validate schemas
    // 5. Register tools in Tool Runtime
    // 6. Store connection metadata
  }

  async executeTool(connectionId: string, toolName: string, input: any): Promise<any> {
    // 1. Get connection
    // 2. Validate input against tool schema
    // 3. Send tool/call request
    // 4. Stream or await response
    // 5. Format result
  }

  async healthCheck(connectionId: string): Promise<HealthStatus> {
    // Ping server and check tool availability
  }
}
```

### 6.2 Git Integration

```typescript
interface GitIntegration {
  // Status and diff
  getStatus(projectPath: string): Promise<GitStatus>;
  getDiff(projectPath: string, filePath?: string): Promise<string>;

  // Branching
  createBranch(projectPath: string, branchName: string): Promise<void>;
  checkoutBranch(projectPath: string, branchName: string): Promise<void>;

  // Committing
  stageFiles(projectPath: string, paths: string[]): Promise<void>;
  commit(projectPath: string, message: string): Promise<string>; // Returns commit hash

  // PR prep
  generatePRDescription(projectPath: string, baseBranch: string): Promise<string>;

  // Repo analysis
  getCommitHistory(projectPath: string, filePath?: string): Promise<Commit[]>;
  getBlame(projectPath: string, filePath: string, line?: number): Promise<BlameLine[]>;
}
```

### 6.3 LSP Integration

```typescript
interface LSPClient {
  // Lifecycle
  startServer(projectPath: string, language: string): Promise<void>;
  stopServer(projectPath: string): Promise<void>;

  // Navigation
  goToDefinition(filePath: string, position: Position): Promise<Location[]>;
  findReferences(filePath: string, position: Position): Promise<Location[]>;

  // Intelligence
  getHover(filePath: string, position: Position): Promise<HoverInfo>;
  getSymbols(filePath: string): Promise<DocumentSymbol[]>;
  getDiagnostics(filePath: string): Promise<Diagnostic[]>;

  // Workspace
  getWorkspaceSymbols(query: string): Promise<SymbolInformation[]>;

  // Formatting
  formatDocument(filePath: string): Promise<TextEdit[]>;
}
```

### 6.4 External Provider Integration

**OpenAI-Compatible:**
- Endpoint: `https://api.openai.com/v1` (or any compatible endpoint)
- SDK: `openai` npm package
- Key config: `baseURL`, `apiKey`, `model`

**Gemini:**
- SDK: `@google/generative-ai`
- Key config: `apiKey`, `model` (e.g., `gemini-2.5-pro`)

**Ollama:**
- Endpoint: `http://localhost:11434` (default)
- Protocol: REST (OpenAI-compatible subset)
- Key config: `baseURL`, `model`

---

## 7. Security Architecture

### 7.1 Threat Model

| Threat | Mitigation |
|---|---|
| **Malicious code execution** | Sandboxing, approval gates, restricted shell |
| **Secret exfiltration** | Path protection, network allowlists, secret vault |
| **Unauthorized tool access** | Permission engine, policy enforcement |
| **Prompt injection via files** | Input sanitization, schema validation |
| **Memory poisoning** | Confidence scoring, user review for auto-memories |
| **Cross-session data leakage** | Session isolation, project-scoped memory |
| **Network-based attacks** | Outbound allowlists, no inbound server exposure |

### 7.2 Secret Management

```typescript
interface SecretVault {
  // Store in OS keychain when available
  set(key: string, value: string, scope: 'user' | 'project'): Promise<void>;
  get(key: string, scope: 'user' | 'project'): Promise<string | null>;
  delete(key: string, scope: 'user' | 'project'): Promise<void>;
  list(scope: 'user' | 'project'): Promise<string[]>;
}

// Usage in tool configs:
interface ToolConfig {
  apiKey?: string | { vault: string; key: string }; // Reference to vault
}
```

**Storage Hierarchy:**
1. **OS Keychain** (macOS Keychain, Windows Credential Manager, Linux Secret Service)
2. **Encrypted file** (AES-256-GCM with user password) as fallback
3. **Environment variables** for CI/runner mode
4. **Never** plaintext in config files

### 7.3 Path Protection

```typescript
const DEFAULT_PROTECTED_PATHS = [
  '.env',
  '.env.*',
  '**/secrets/**',
  '**/*.pem',
  '**/*.key',
  '**/node_modules/**',
  '**/.git/**',
  '**/.ssh/**',
  '**/credentials/**',
  '**/auth/**',
];

function isPathProtected(filePath: string, customRules?: string[]): boolean {
  // Check against default + custom protected paths
  // Return true if write/delete should require extra approval
}
```

### 7.4 Network Security

```typescript
interface NetworkPolicy {
  mode: 'block' | 'allowlist' | 'unrestricted';
  allowlist?: string[];        // Hostname patterns
  blocklist?: string[];
  maxRequestsPerMinute?: number;
}

// Enforced at tool runtime level:
// - HTTP tools route through proxy
// - Proxy checks URL against policy
// - Blocked requests return error to agent
```

### 7.5 Audit Logging

All security-relevant events are logged to `~/.localmind/audit/{date}.log`:

```json
{
  "timestamp": "2026-06-10T12:00:00Z",
  "event": "tool_execution",
  "sessionId": "sess_abc123",
  "tool": "write_file",
  "input": { "path": "src/main.ts" },
  "policy_mode": "balanced",
  "decision": "approved",
  "reason": "auto-approved: file in project scope, no protected path match",
  "userId": "bharat",
  "ip": null
}
```

---

## 8. Performance & Scalability

### 8.1 Performance Targets

| Metric | Target | Measurement |
|---|---|---|
| **UI cold start** | < 3 seconds | Desktop app ready for input |
| **Project scan (10K files)** | < 30 seconds | Initial repo map generation |
| **Tool execution latency** | < 500ms | Read/search tools |
| **Shell command latency** | < 2 seconds | Simple commands |
| **LLM first token latency** | < 2 seconds | First chunk received |
| **Context retrieval** | < 200ms | Memory search + instruction load |
| **Checkpoint creation** | < 1 second | Pre-write snapshot |
| **Session export** | < 3 seconds | Full session JSON |

### 8.2 Optimization Strategies

**Repo Map Caching:**
- Cache repo map in SQLite with file hash invalidation
- Incremental updates via file watcher (chokidar)
- Background re-indexing on large changes

**Context Window Management:**
- Sliding window with summarization for long sessions
- Priority-based context injection (instructions > recent steps > older steps)
- Token counting before every LLM call
- Automatic summarization of completed task branches

**Model Call Optimization:**
- Streaming for all chat endpoints
- Parallel calls for independent subagent tasks
- Batched embedding requests for semantic search
- Local model caching (Ollama keeps models loaded)

**Tool Execution:**
- Reuse LSP server connections per project
- Persistent shell sessions for sequential commands
- Lazy MCP server startup (connect on first use)
- Result caching for idempotent tools (read, search)

---

## 9. Deployment Architecture

### 9.1 Desktop App (Primary)

```
+-------------------------+
|      Electron App       |
|  +-------------------+  |
|  |  React Frontend   |  |
|  |  (Main UI)        |  |
|  +-------------------+  |
|  +-------------------+  |
|  |  Node.js Backend  |  |
|  |  (Core Engine)    |  |
|  +-------------------+  |
+-------------------------+
           |
    +------+------+
    |             |
 SQLite      Ollama
```

**Packaging:**
- Electron Builder for macOS (.dmg), Windows (.exe), Linux (.AppImage/.deb)
- Auto-updater via GitHub Releases
- Native module compilation for keytar, better-sqlite3

### 9.2 Terminal/CLI

```
$ localmind --help
$ localmind open ./my-project
$ localmind --mode build "Refactor auth module"
$ localmind --session sess_abc123 --resume
```

**Implementation:**
- CLI package: `localmind-cli`
- Ink-based TUI for interactive sessions
- Supports piping: `git diff | localmind --review`
- Headless mode: `localmind --headless --script workflow.json`

### 9.3 VS Code Extension

```
VS Code
+-- Extension Host
|   +-- LocalMind Client
|   +-- LSP Bridge
+-- Webview Panels
    +-- Agent Dashboard
    +-- Execution Log
    +-- Approval Queue
```

**Communication:**
- VS Code extension connects to running LocalMind daemon via WebSocket
- Falls back to spawning LocalMind process if not running
- LSP bridge forwards language intelligence to LocalMind

### 9.4 Background Agent Daemon

```
systemd / launchd / Windows Service
+-- localmind-daemon
    +-- Job Scheduler (bullmq)
    +-- Background Agents
    +-- File Watchers
    +-- Webhook Listeners
```

**Configuration:**
```json
{
  "daemon": {
    "enabled": true,
    "port": 56789,
    "maxConcurrentJobs": 3,
    "jobTimeoutMs": 300000,
    "logLevel": "info"
  }
}
```

---

## 10. Implementation Roadmap

### 10.1 Phase 1: Foundation (6-8 weeks)

**Week 1-2: Core Infrastructure**
- [ ] SQLite schema and database layer
- [ ] Configuration system (YAML + JSON)
- [ ] Logging and error handling framework
- [ ] Event bus for internal communication
- [ ] WebSocket server for UI sync

**Week 3-4: Project & Session Management**
- [ ] Project onboarding and repo scanning
- [ ] Repo map generation (directory tree, package detection)
- [ ] Session lifecycle and state machine
- [ ] LOCALMIND.md parsing and injection
- [ ] Basic memory storage (CRUD)

**Week 5-6: Tool Runtime v1**
- [ ] Built-in tools: read, write, edit, patch, grep, glob
- [ ] Bash execution with node-pty
- [ ] Web fetch and search tools
- [ ] Tool schema validation
- [ ] Basic permission engine (safe/trusted modes)

**Week 7-8: Integration & Polish**
- [ ] Git integration (status, diff, commit)
- [ ] Model gateway with OpenAI + Ollama support
- [ ] Desktop app UI shell
- [ ] Terminal CLI with basic interactivity
- [ ] Checkpoint and undo system

### 10.2 Phase 2: Agentic Coding (8-10 weeks)

**Week 1-2: Advanced Tools**
- [ ] LSP client integration
- [ ] Semantic code search (with vector embeddings)
- [ ] Browser automation via Playwright MCP
- [ ] Test runner tool integration
- [ ] Custom tool SDK (Python + Node.js templates)

**Week 3-4: MCP & Skills**
- [ ] MCP client implementation
- [ ] MCP server registry and catalog UI
- [ ] Skill parser and engine
- [ ] 5 launch skills implementation
- [ ] Slash command framework

**Week 5-6: Subagents**
- [ ] Subagent spawning and context isolation
- [ ] Subagent communication (summary return)
- [ ] Model routing per subagent
- [ ] Context budget enforcement
- [ ] Human takeover mechanism

**Week 7-8: Scheduler**
- [ ] Cron job scheduler
- [ ] File watcher triggers
- [ ] Webhook endpoint
- [ ] Background job dashboard
- [ ] Job history and retry logic

**Week 9-10: VS Code Extension**
- [ ] Extension scaffolding and manifest
- [ ] WebSocket connection to LocalMind
- [ ] Webview panels (agent dashboard, execution log)
- [ ] LSP bridge
- [ ] Command palette integration

### 10.3 Phase 3: Advanced Orchestration (10-12 weeks)

**Week 1-3: Agent Teams**
- [ ] Multi-agent task board
- [ ] Inter-agent messaging
- [ ] Role assignment framework
- [ ] Team coordination algorithms
- [ ] Agent team dashboard

**Week 4-6: Evaluation & Quality**
- [ ] Agent evaluation layer (cost, latency, success scoring)
- [ ] Benchmark harness
- [ ] Regression detection
- [ ] Performance profiling per run
- [ ] Cost optimization suggestions

**Week 7-9: Extended Surfaces**
- [ ] Browser companion extension
- [ ] Remote control (web-based session viewer)
- [ ] Session sharing and replay
- [ ] Mobile notification client

**Week 10-12: Marketplace & Ecosystem**
- [ ] Skill bundle format
- [ ] Skill marketplace UI
- [ ] Team workspace sharing
- [ ] Advanced QA automation packs
- [ ] Enterprise policy templates

---

## Appendix A: File Structure

```
localmind/
+-- src/
|   +-- core/
|   |   +-- engine.ts              # Main LocalMindEngine
|   |   +-- session-manager.ts
|   |   +-- agent-orchestrator.ts
|   |   +-- event-bus.ts
|   +-- tools/
|   |   +-- built-in/              # File ops, search, shell
|   |   +-- mcp-client.ts
|   |   +-- custom-tool-loader.ts
|   |   +-- tool-runtime.ts
|   +-- models/
|   |   +-- gateway.ts
|   |   +-- providers/
|   |   |   +-- openai.ts
|   |   |   +-- gemini.ts
|   |   |   +-- ollama.ts
|   |   +-- router.ts
|   +-- memory/
|   |   +-- service.ts
|   |   +-- vector-store.ts
|   |   +-- import-export.ts
|   +-- skills/
|   |   +-- engine.ts
|   |   +-- parser.ts
|   |   +-- registry.ts
|   +-- permissions/
|   |   +-- engine.ts
|   |   +-- policies.ts
|   |   +-- audit-logger.ts
|   +-- scheduler/
|   |   +-- cron.ts
|   |   +-- triggers.ts
|   |   +-- daemon.ts
|   +-- integrations/
|   |   +-- git.ts
|   |   +-- lsp-client.ts
|   |   +-- secrets-vault.ts
|   +-- database/
|   |   +-- schema.ts
|   |   +-- migrations/
|   |   +-- connection.ts
|   +-- types/
|   |   +-- index.ts               # All interfaces
|   +-- ui/
|   |   +-- desktop/               # Electron app
|   |   +-- vscode-ext/            # VS Code extension
|   |   +-- web-companion/         # Browser-based UI
|   +-- cli/
|   |   +-- index.ts               # Terminal interface
|   +-- skills/
|   |   +-- built-in/              # Bundled skills
|   |   +-- templates/             # Skill templates
|   +-- docs/
|   |   +-- prd.md
|   |   +-- trd.md
|   +-- tests/
|   |   +-- unit/
|   |   +-- integration/
|   |   +-- e2e/
|   +-- package.json
|   +-- tsconfig.json
|   +-- README.md
```

## Appendix B: Configuration Schema

```yaml
# ~/.localmind/config.yaml
version: 1

# Model routing
models:
  primary_provider: openai
  fallback_providers: [gemini, ollama]
  ollama_base_url: http://localhost:11434
  openai_base_url: https://api.openai.com/v1
  gemini_api_key: { vault: user, key: gemini_api_key }

  preferred_models:
    explore: ollama/llama3.1:8b
    plan: openai/gpt-4o
    implement: openai/gpt-4o
    review: anthropic/claude-sonnet-4
    test: ollama/llama3.1:8b
    debug: openai/gpt-4o

# Behavior
behavior:
  default_mode: balanced
  plan_first: true
  auto_memory: true
  checkpoint_before_write: true

# Permissions
permissions:
  mode: balanced
  custom_rules:
    - tool: bash
      action: ask
      conditions:
        commands: [rm, chmod, curl]
    - tool: write_file
      action: ask
      conditions:
        paths: ['.env', '*.pem', 'secrets/**']

# MCP servers
mcp_servers:
  - id: playwright
    name: Browser Automation
    transport: stdio
    command: npx
    args: ['@anthropic-ai/playwright-mcp@latest']

  - id: sqlite
    name: Database
    transport: stdio
    command: node
    args: ['sqlite-mcp-server.js']

# Skills
skills:
  auto_load_builtin: true
  custom_paths:
    - ~/.localmind/skills/
    - ./.localmind/skills/

# Daemon
daemon:
  enabled: true
  port: 56789
  max_concurrent_jobs: 3
```

## Appendix C: Testing Strategy

| Layer | Testing Approach |
|---|---|
| **Unit** | Jest for TypeScript services, 80% coverage target |
| **Integration** | Test tool runtime, model gateway, MCP client against real providers (mocked for CI) |
| **E2E** | Playwright tests for desktop app flows; CLI tests with expect scripts |
| **Agent Evaluation** | SWE-bench style tasks, cost/latency/success scoring |
| **Performance** | Benchmark repo scanning, context retrieval, checkpoint creation |
| **Security** | Path traversal tests, secret exfiltration attempts, permission bypass tests |

---

*This TRD is a living document. Update version and date on each revision.*
