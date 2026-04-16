# LocalMind — Missing Features & Gap Analysis

> **Purpose:** This document lists all features that are implemented on the **backend (IPC/main process)** but are **not yet connected or built on the frontend (renderer/UI)**. Each entry describes what is expected and exactly where in the codebase it should be added.

---

## 🔴 CRITICAL: Preload Bridge Stubs

### What is Missing
`src/preload/index.ts` currently exposes **stub/empty implementations** for most feature namespaces. This means even though the backend IPC handlers are fully implemented, the renderer (React UI) cannot call them.

### What is Expected
All the following namespaces in `window.localmind` must be wired to real `ipcRenderer.invoke()` / `ipcRenderer.on()` calls:

| Namespace | IPC Channels to Wire |
|---|---|
| `window.localmind.mcp` | `mcp:connect`, `mcp:disconnect`, `mcp:restart`, `mcp:removeServer`, `mcp:callTool`, `mcp:listTools`, `mcp:listResources`, `mcp:readResource`, `mcp:listPrompts`, `mcp:getPrompt`, `mcp:serverStatus`, `mcp:approvalResponse` |
| `window.localmind.skill` | `skill:list`, `skill:run`, `skill:create`, `skill:update`, `skill:delete`, `skill:activate` |
| `window.localmind.artifact` | `artifact:save`, `artifact:list`, `artifact:getVersions`, `artifact:export` |
| `window.localmind.workspace` | `workspace:create`, `workspace:list`, `workspace:update`, `workspace:delete`, `workspace:setActive` |
| `window.localmind.persona` | `persona:list`, `persona:create`, `persona:update`, `persona:delete` |
| `window.localmind.rag` | `rag:index`, `rag:query`, `rag:status`, `rag:listDocuments`, `rag:removeDocument` |
| `window.localmind.data` | `data:exportAll`, `data:importAll`, `data:exportConversation` |
| `window.localmind.file` | `file:upload`, `file:uploadFolder`, `file:read` |
| `window.localmind.url` | `url:fetch` |

### Where to Fix
📄 **File:** `src/preload/index.ts`

---

## 1. MCP Manager UI

### What is Missing
There is no user interface to manage MCP (Model Context Protocol) servers. Users cannot add, remove, restart, or view the status of MCP servers from the app.

### What is Expected
- A UI panel listing all connected and saved MCP servers with their status (connected / disconnected / error)
- A form to add a new MCP server (stdio or HTTP+SSE type), with fields for name, command, args, URL
- Buttons to **Connect**, **Disconnect**, **Restart**, and **Remove** each server
- A **Tool Approval Dialog** that appears when `mcp:approvalRequest` event is received — shows tool name, arguments, and **Approve / Deny** buttons that send back `mcp:approvalResponse`
- A tool/resource browser to view tools and resources exposed by each connected server

### Where to Implement
📁 **Folder:** `src/renderer/components/mcp/`
- `MCPServerList.tsx` — lists all servers
- `MCPAddServerForm.tsx` — form to add a new server
- `MCPToolApprovalDialog.tsx` — approval dialog for tool calls
- `MCPToolBrowser.tsx` — browse tools and resources per server

**Also update:**
- `src/renderer/pages/SettingsPage.tsx` — add an "MCP Servers" tab/section
- `src/renderer/store/mcpStore.ts` — connect store actions to real preload IPC calls

---

## 2. Skills UI

### What is Missing
Skills are fully implemented on the backend (list, run, CRUD, activate) but there is no UI for users to browse, activate, create, or run skills.

### What is Expected
- A **Skill Browser** panel listing all built-in and custom skills with name, description, and an **Activate** button
- A **Skill Creator/Editor** form with fields for name, description, system prompt, and steps
- Ability to activate a skill for the current conversation (calls `skill:activate`)
- Visual indication in the chat that a skill is active

### Where to Implement
📁 **Folder:** `src/renderer/components/skills/`
- `SkillBrowser.tsx` — lists all skills
- `SkillEditor.tsx` — create/edit skill form
- `ActiveSkillBadge.tsx` — badge shown in chat input when a skill is active

**Also update:**
- `src/renderer/components/chat/ChatInput.tsx` — add skill activation trigger button
- `src/renderer/store/skillStore.ts` — wire to real IPC calls

---

## 3. Artifacts Panel

### What is Missing
The `uiStore` already has an `artifactPanelOpen` flag and the backend fully handles artifact save/list/version/export. But there is no sliding panel or viewer in the UI.

### What is Expected
- A **sliding right-side panel** that opens when `artifactPanelOpen` is `true`
- Lists all artifacts for the current conversation with name, type, version, and created date
- Clicking an artifact opens it in a viewer (code viewer for code artifacts, markdown renderer for text)
- A **Version History** button per artifact that shows all previous versions
- An **Export** button that triggers `artifact:export` (e.g., download as file)

### Where to Implement
📁 **Folder:** `src/renderer/components/artifacts/`
- `ArtifactPanel.tsx` — the sliding panel container
- `ArtifactList.tsx` — list of artifacts
- `ArtifactViewer.tsx` — displays a single artifact
- `ArtifactVersionHistory.tsx` — version list modal

**Also update:**
- `src/renderer/App.tsx` — render `<ArtifactPanel />` conditionally based on `uiStore.artifactPanelOpen`
- `src/renderer/components/chat/ChatMessage.tsx` — add a button to save a message as an artifact

---

## 4. Workspaces UI

### What is Missing
Workspaces have full backend support (CRUD, setActive) and the `workspaceStore` exists in Zustand, but are not connected to real IPC calls and there is no workspace switcher or manager in the UI.

### What is Expected
- A **Workspace Switcher** in the sidebar header showing the current workspace name with a dropdown to switch
- A **Workspace Manager** modal/page to create, edit (name, system prompt, default model), and delete workspaces
- When a workspace is activated, the sidebar conversation list should filter to that workspace's conversations

### Where to Implement
📁 **Folder:** `src/renderer/components/workspaces/`
- `WorkspaceSwitcher.tsx` — dropdown in sidebar header
- `WorkspaceManager.tsx` — full CRUD manager modal

**Also update:**
- `src/renderer/components/Sidebar.tsx` — embed `<WorkspaceSwitcher />` at the top
- `src/renderer/store/workspaceStore.ts` — connect all actions to real preload IPC calls

---

## 5. Personas UI

### What is Missing
Personas (with system prompts and icons) are fully implemented in the backend but there is no picker or manager in the UI. The `applyTemplateVariables` function also exists but is unused in the frontend.

### What is Expected
- A **Persona Picker** available when starting a new conversation — shows a grid of personas with icons and names
- A **Persona Manager** in Settings to create, edit (name, icon, system prompt, template variables), and delete personas
- Template variable support: if a persona's system prompt contains `{{variable}}` placeholders, show an input form to fill them before starting the chat

### Where to Implement
📁 **Folder:** `src/renderer/components/personas/`
- `PersonaPicker.tsx` — modal grid to pick a persona
- `PersonaManager.tsx` — CRUD manager in settings
- `TemplateVariableForm.tsx` — dynamic form for template variables

**Also update:**
- `src/renderer/pages/SettingsPage.tsx` — add a "Personas" section
- `src/renderer/components/chat/NewConversationView.tsx` — embed `<PersonaPicker />` before first message

---

## 6. RAG (Document Knowledge Base) UI

### What is Missing
The RAG backend is fully implemented (index, query, status, list, remove documents) and the `ragStore` exists in Zustand, but it is not connected to real IPC calls and there is no document management UI.

### What is Expected
- A **Document Manager** panel (in sidebar or settings) showing all indexed documents with name, status (indexed / indexing / error), and chunk count
- An **Add Document** button that opens a file picker, uploads the file, and shows indexing progress
- An **Add Folder** button for bulk ingestion via `file:uploadFolder`
- A **Remove Document** button per document
- A RAG status indicator showing if the index is ready
- When RAG is active, retrieved document chunks should be visually indicated in the chat (e.g., "Sources" section below the response)

### Where to Implement
📁 **Folder:** `src/renderer/components/rag/`
- `DocumentManager.tsx` — list and manage indexed documents
- `AddDocumentButton.tsx` — file picker + indexing progress
- `RAGSourcesDisplay.tsx` — shows retrieved chunks below a message

**Also update:**
- `src/renderer/store/ragStore.ts` — connect all actions to real preload IPC calls
- `src/renderer/components/Sidebar.tsx` — add a "Knowledge" section with `<DocumentManager />`

---

## 7. File Upload & URL Fetch UI in Chat

### What is Missing
`file:upload` and `url:fetch` IPC handlers are fully ready, but there is no UI in the chat input to attach files or paste URLs for context injection.

### What is Expected
- A **paperclip/attachment button** in `ChatInput.tsx` that opens a file picker and uploads the selected file, injecting its extracted text content into the conversation context
- A **link/URL button** or detection of pasted URLs in `ChatInput.tsx` that triggers `url:fetch` and injects the fetched page content as context
- A **context chip/badge** above the input showing attached files/URLs with an ✕ to remove them

### Where to Implement
📄 **File:** `src/renderer/components/chat/ChatInput.tsx`
- Add attachment button with file picker
- Add URL paste detection / URL button
- Render context chips for attached items

**Also update:**
- `src/renderer/components/chat/ContextBar.tsx` — optionally show attached file names in the context bar

---

## 8. Data Export & Import UI

### What is Missing
`data:exportAll`, `data:importAll`, and `data:exportConversation` IPC handlers are implemented but there are no corresponding buttons/options in the Settings page or conversation menu.

### What is Expected
- In **Settings → Data**:
  - An **Export All Data** button that triggers `data:exportAll` and downloads a ZIP
  - An **Import Data** button that opens a file picker for a ZIP and triggers `data:importAll`
- In the **conversation context menu** (right-click or ⋮ menu on a conversation):
  - An **Export as Markdown** option
  - An **Export as PDF** option
  Both trigger `data:exportConversation` with the appropriate format.

### Where to Implement
📄 **File:** `src/renderer/pages/SettingsPage.tsx` — add a "Data" tab with export/import buttons
📄 **File:** `src/renderer/components/Sidebar.tsx` — add export options to conversation item context menu

---

## 9. Conversation Starring (Pinning)

### What is Missing
The `conversations` table has a `starred` column and the DB supports updating it, but there is no star/pin button in the sidebar conversation list.

### What is Expected
- A **star icon** on each conversation item in the sidebar that toggles `starred` state
- A **Starred** filter or section at the top of the sidebar to quickly access pinned conversations

### Where to Implement
📄 **File:** `src/renderer/components/Sidebar.tsx`
- Add star toggle button per conversation item
- Add starred filter/section logic at the top of the conversation list

---

## 10. Message Branching UI

### What is Missing
The messages schema has `branchId` and `parentMessageId` columns to support conversation branching (e.g., regenerating from a different point), and `db:deleteMessagesAfter` exists for pruning. However, there is no branch navigator in the chat UI.

### What is Expected
- When a message has been regenerated (multiple branches exist), show **← 1/2 →** navigation arrows on that message to switch between branches
- The branch navigator should update the displayed conversation thread based on the selected branch

### Where to Implement
📄 **File:** `src/renderer/components/chat/ChatMessage.tsx`
- Add branch navigator component (previous/next branch arrows + counter)
- Add logic to load and switch between branches

---

## 11. Model Profiles CRUD UI

### What is Missing
A `modelProfiles` table exists in the database schema for saving named model configurations (temperature, maxTokens, default model, etc.), but there is no UI to create, view, edit, or delete these profiles.

### What is Expected
- A **Model Profiles** section in Settings where users can:
  - Create a named profile (e.g., "Creative", "Precise") with temperature and token settings
  - Set a profile as default
  - Edit or delete existing profiles

### Where to Implement
📄 **File:** `src/renderer/pages/SettingsPage.tsx` — add a "Model Profiles" section

---

## 12. Custom Global Shortcut UI

### What is Missing
`settings:updateShortcut` IPC handler exists and can live-reregister the global keyboard shortcut, but there is no input field in SettingsPage where users can change it from the default `Ctrl+Shift+Space`.

### What is Expected
- In **Settings → General**: a **Keyboard Shortcut** input (using a key-capture input) that shows the current shortcut and allows the user to record a new one, saving it via `settings:updateShortcut`

### Where to Implement
📄 **File:** `src/renderer/pages/SettingsPage.tsx` — add shortcut capture input in General settings

---

## 13. Skill Pipelines Builder

### What is Missing
The `skillPipelines` table exists in the database schema for multi-step skill pipelines, but there is no backend IPC handler or frontend UI for managing pipelines.

### What is Expected
- A **Pipeline Builder** UI where users can chain multiple skills together in a sequence
- Backend IPC handlers: `pipeline:create`, `pipeline:list`, `pipeline:run`, `pipeline:delete`

### Where to Implement
📁 **Folder:** `src/renderer/components/skills/`
- `PipelineBuilder.tsx` — drag-and-drop or ordered list pipeline builder

**Also add:**
- `src/main/ipc.ts` — add pipeline IPC handlers
- `src/main/skills/pipeline-runner.ts` — execute chained skills

---

## 📋 Priority Order

| Priority | Feature | Location |
|---|---|---|
| 🔴 P0 | Fix Preload Bridge Stubs | `src/preload/index.ts` |
| 🔴 P0 | MCP Tool Approval Dialog | `src/renderer/components/mcp/MCPToolApprovalDialog.tsx` |
| 🟠 P1 | MCP Manager UI | `src/renderer/components/mcp/` |
| 🟠 P1 | File Upload + URL Fetch in Chat | `src/renderer/components/chat/ChatInput.tsx` |
| 🟠 P1 | RAG Document Manager UI | `src/renderer/components/rag/` |
| 🟡 P2 | Personas UI | `src/renderer/components/personas/` |
| 🟡 P2 | Workspaces UI | `src/renderer/components/workspaces/` |
| 🟡 P2 | Artifacts Panel | `src/renderer/components/artifacts/` |
| 🟢 P3 | Skills UI | `src/renderer/components/skills/` |
| 🟢 P3 | Data Export/Import UI | `src/renderer/pages/SettingsPage.tsx` |
| 🟢 P3 | Conversation Starring | `src/renderer/components/Sidebar.tsx` |
| 🔵 P4 | Message Branching UI | `src/renderer/components/chat/ChatMessage.tsx` |
| 🔵 P4 | Model Profiles UI | `src/renderer/pages/SettingsPage.tsx` |
| 🔵 P4 | Custom Shortcut UI | `src/renderer/pages/SettingsPage.tsx` |
| ⚫ P5 | Skill Pipelines Builder | `src/renderer/components/skills/PipelineBuilder.tsx` |

---

*Generated via automated gap analysis comparing IPC handlers in `src/main/ipc.ts` against renderer components and preload bridge in `src/preload/index.ts`.*
