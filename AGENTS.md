# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

LocalMind is a privacy-first local AI desktop app built with Electron + React. It provides a chat interface to local (Ollama) and cloud LLM providers, with planned MCP (Model Context Protocol) integration, RAG, workspaces, skills, personas, and artifact generation. Many of these features are currently stubbed.

## Commands

- `npm run dev` — Start Electron app with hot-reload dev server
- `npm run build` — Build main + preload + renderer via electron-vite
- `npm run preview` — Preview the built app
- `npm run package` — Build + package into distributable (NSIS installer on Windows)
- `npm run test:unit` — Run unit tests with Vitest
- `npm run test:e2e` — Run E2E tests with Playwright

## Architecture

Electron app using **electron-vite** with three process layers:

```
src/main/        → Electron main process (Node.js)
src/preload/     → Context bridge (exposes window.localmind API)
src/renderer/    → React 19 frontend (Vite + Tailwind v4)
src/shared/      → Shared type definitions
```

### Main Process (`src/main/`)

- **index.ts** — App lifecycle: single-instance lock, window creation, global shortcut (Ctrl+Shift+Space), DB init on startup
- **ipc.ts** — All IPC handler registrations. Implements LLM streaming, DB CRUD, settings. MCP/Skills/Artifacts/Workspaces/Personas/RAG/Data/File/URL are **stubbed** (return empty/null)
- **llm/router.ts** — `LLMRouter` dispatches to provider instances based on `ProviderType`. Enforces Privacy Mode (blocks non-Ollama providers when enabled)
- **llm/providers/** — Five providers: `ollama`, `openai`, `openrouter`, `google`, `custom` — each implements `LLMProvider` interface (`complete`, `listModels`, `validateConfig`)
- **llm/streaming.ts** — Stream ID creation + IPC chunk/done/error sending via `win.webContents.send`
- **llm/token-counter.ts** — Token counting using tiktoken
- **llm/auto-title.ts** — Auto-generates conversation titles after first response
- **db/connection.ts** — sql.js (in-memory SQLite) persisted to `localmind.db` in userData. Uses Drizzle ORM. `persistDatabase()` writes to disk after every write operation
- **db/schema.ts** — Drizzle schema: workspaces, conversations, messages, artifacts, mcpServers, skills, personas, providerConfigs, modelProfiles, pinnedFiles, skillPipelines
- **settings/app-store.ts** — `electron-store` for app settings (theme, privacy mode, window bounds, etc.)
- **settings/secrets.ts** — Separate `electron-store` file for API keys with encryption
- **utils/ipc-response.ts** — `IPCResponse<T>` wrapper with `safeHandle()` that catches errors and returns `{ success, data?, error? }`

### Preload (`src/preload/index.ts`)

Uses `contextBridge.exposeInMainWorld('localmind', {...})` to expose namespaced API:
- `window.localmind.llm` — Stream start/cancel, model listing, chunk/done/error listeners
- `window.localmind.db` — Conversation + message CRUD
- `window.localmind.settings` — Get/set/reset settings
- `window.localmind.mcp` / `.skill` / `.artifact` / `.workspace` / `.persona` / `.rag` / `.data` / `.file` / `.url` — All stubbed

### Renderer (`src/renderer/`)

- **App.tsx** — Root layout: Sidebar + ChatView + ToastContainer + SettingsPage modal
- **stores/** — Zustand stores:
  - `chatStore` — Conversations, messages, streaming state. Calls `window.localmind.db.*`
  - `providerStore` — Available models, selected model, provider status
  - `settingsStore` — Theme, privacy mode
  - `uiStore` — Sidebar/artifact panel state
  - `ragStore`, `workspaceStore`, `notificationStore` — Supporting stores
- **hooks/useStreaming.ts** — Core streaming hook: creates assistant placeholder, subscribes to chunk/done/error IPC events
- **hooks/useDebounce.ts**, **useNotification.ts** — Utility hooks
- **components/** — `chat/` (ChatView, ChatInput, MessageList, MessageBubble, ContextBar, ModelSelector), `sidebar/` (Sidebar, ConversationList), `settings/` (SettingsPage), `ui/` (ToastContainer)

### Shared (`src/shared/types/localmind-api.ts`)

TypeScript interfaces mirroring the preload bridge API — `LocalMindAPI`, `LLMApi`, `DbApi`, etc. Declares `window.localmind` on the global scope.

## Key Patterns

- **IPC flow**: Renderer calls `window.localmind.*` → preload bridge → `ipcMain.handle` in main process → returns `IPCResponse<T>`
- **LLM streaming**: `llm:startStream` returns a `streamId`, then main process sends `llm:chunk:{streamId}`, `llm:done:{streamId}`, `llm:error:{streamId}` events back to renderer
- **Database**: sql.js in-memory SQLite with synchronous disk persistence after each write. No migrations framework — `runMigrations()` creates tables if they don't exist
- **All IPC responses** use `safeHandle()` wrapper returning `{ success, data?, error? }`
- **Path aliases**: `@shared` → `src/shared`, `@` → `src/renderer/src` (configured in electron.vite.config.ts)

## Current State

- **Implemented**: LLM streaming (Ollama + cloud providers), conversation CRUD, message streaming, settings, token counting, auto-title, privacy mode, theming
- **Stubbed** (IPC handlers return empty/null): MCP, Skills, Artifacts, Workspaces, Personas, RAG, Data export/import, File upload (except `file:read`), URL fetch