# LocalMind

> **Privacy-first local AI desktop application** — Chat with local and cloud LLMs from a modern Electron + React interface. Features multi-model consensus, agent workspaces, MCP server integration, skills, personas, RAG, web search, and full conversation history — all stored locally.

---

## Features

### Multi-Provider LLM Chat

| Provider | Description |
|---|---|
| **Ollama (Local)** | Run fully offline with any Ollama model (Llama, Mistral, Qwen, DeepSeek, Phi, etc.) |
| **OpenAI** | GPT-4o, GPT-4o-mini, GPT-4.1 and more |
| **OpenRouter** | Access 200+ models via a single API key |
| **Google Gemini** | Gemini 2.5, 2.0 Flash, Pro variants |
| **Custom Providers** | Any OpenAI-compatible endpoint (LM Studio, vLLM, Groq, Together AI, etc.) |

- Real-time streaming responses with chunk-by-chunk rendering
- Auto-generated conversation titles
- Token counting via tiktoken
- Markdown, syntax-highlighted code, LaTeX (KaTeX), and Mermaid diagrams

### Consensus Engine

Multi-model query with synthesis — inspired by Perplexity's Model Council.

- Select 2-5 models as "council members"
- Choose a synthesizer model to combine outputs
- Optional web search augmentation before querying
- All models are queried in parallel
- Synthesizer produces a unified answer highlighting agreements and disagreements
- Consensus conversations are saved and accessible from the sidebar

### Agent Workspaces

Built-in AI agents with specialized capabilities:

| Agent | Capabilities |
|---|---|
| **Cowork** | Plan, Review, Debug, Test, Coordinate |
| **Code** | Glob, Grep, Read, Write, Delete, NPM, MCP, Skills |

- Each agent gets its own conversation workspace
- Attach a local folder as workspace context
- Quick-start prompts for common tasks
- Create custom agents with your own system prompts and tool access

### MCP Server Integration

Full Model Context Protocol support with a built-in marketplace:

- **Marketplace** — One-click install for official MCP servers (Filesystem, GitHub, Brave Search, Puppeteer, PostgreSQL, Slack, Memory, and more)
- **Custom servers** — Add any MCP server via stdio or HTTP+SSE transport
- **Tool execution** — Models can call MCP tools with user approval
- **Resource access** — Read resources exposed by MCP servers
- **Prompt templates** — Use MCP-provided prompt templates
- **Auto-approve** — Configure trusted tools to skip approval prompts
- **Toggle from chat** — Enable/disable MCP servers directly from the `+` menu in chat input

### Skills System

Reusable AI instructions that augment model behavior:

- **Built-in skills** — API Doc Writer, Code Reviewer, Bug Analysis, Data Cleaner, Email Drafter, Incident Analyzer, SQL Builder, System Design, Test Case Generator, and more
- **Custom skills** — Create your own skills with name, description, and system prompt
- **Skill launcher** — Type `/` in the chat input to browse and activate skills
- **Skill pipelines** — Chain multiple skills together (schema ready)

### Personas

Named assistant personalities with custom system prompts:

- Create personas with specific behavior, tone, and expertise
- Switch personas per-conversation from the chat input toolbar
- Personas support template variables (`{{model}}`, `{{provider}}`)
- Manage personas in Settings or pick from the chat toolbar

### RAG (Retrieval-Augmented Generation)

Local document knowledge base:

- Index documents (PDF, Word, Excel, text files) into a local vector store
- Query your documents using natural language
- Chunks are stored locally using Vectra
- Track indexing progress with real-time status updates
- Remove documents from the index at any time

### Web Search

Augment LLM responses with live web results:

| Provider | API Key Required |
|---|---|
| **Tavily** | Yes |
| **Serper** | Yes |
| **Exa** | Yes |
| **DuckDuckGo** | No (HTML scraping fallback) |

- Toggle web search per-message from the `@WebSearch` button in chat
- Also available in Consensus Engine for research-grade queries
- Results are prepended to your prompt as context

### Privacy Mode

- Toggle to block ALL cloud providers instantly — only Ollama (local) is allowed
- Enforced at the LLM router level in the main process
- API keys stored in a separate encrypted electron-store file

### Prompt Refinement

- Toggle "Refine" to automatically improve your prompt before sending
- Uses the selected model to rewrite your message for clarity and specificity
- One-click toggle in the chat toolbar

### File & URL Attachment

Attach context to any message:

- **Files** — Upload any file (PDF, Word, Excel, images, code, text) from the `+` menu
- **Folders** — Upload entire directories filtered by extension
- **URLs** — Fetch and attach web page content as context
- Images are sent as base64 for multimodal models

### Artifacts Panel

Save, version, and export code/text artifacts generated during conversations:

- Automatic artifact detection
- Version history per artifact
- Export as file

### Data Management

- **Export all** — Download all conversations, settings, and data as a ZIP archive
- **Import all** — Restore from a previously exported ZIP
- **Export conversation** — Save individual conversations as PDF or Markdown


### UI & Customization

- **Dark/Light/System** theme with 9 accent color options (Indigo, Amber, Orange, Rose, Crimson, Coral, Sunset, Gold, Copper)
- **Top ribbon navigation** — Quick icon-only access to Consensus, Agents, Skills, and MCP pages
- **Sidebar** — Conversation list with search, starring, and new chat button
- **Global shortcut** — `Ctrl+Shift+Space` to focus/open the app from anywhere (customizable)
- **Single-instance lock** — Only one app window runs at a time
- **Persistent window state** — Size and position remembered across sessions

---

## Getting Started

### Prerequisites

| Requirement | Version | Purpose |
|---|---|---|
| **Node.js** | 18+ | Runtime for build tooling |
| **npm** | 8+ | Package management |
| **Ollama** *(optional)* | Latest | For local model inference |
| **Git** | Any | Clone the repository |

> For cloud providers (OpenAI, Google, OpenRouter): you'll need API keys, configured in Settings after launch.

### Installation

```bash
# Clone the repository
git clone https://github.com/bharatsharma3092/LocalMind.git
cd LocalMind

# Install dependencies
npm install
```

### (Optional) Set up Ollama for local models

Install Ollama from [https://ollama.com](https://ollama.com), then pull a model:

```bash
ollama pull llama3.2
# or
ollama pull qwen2.5-coder
# or
ollama pull mistral
```

---

## Running the App

### Development Mode (with hot-reload)

```bash
npm run dev
```

Starts the Electron app with a live-reloading Vite dev server. Changes to `src/` auto-refresh.

### Production Build

```bash
npm run build
```

Builds main process, preload, and renderer via electron-vite into `out/`.

### Preview Built App

```bash
npm run preview
```

### Package as Installer (Windows NSIS)

```bash
npm run package
```

Creates a distributable installer in `dist/`.

---

## First Launch

1. **Launch** with `npm run dev` or open the packaged installer
2. **Select a provider** — Ollama is auto-detected if running locally
3. **Add API keys** — Go to Settings → Models and enter keys for OpenAI / Google / OpenRouter
4. **Pick a model** — Use the model selector dropdown in the top bar
5. **Start chatting** — Type a message and press Enter

### Setting Up Web Search

1. Go to Settings → General
2. Enable Web Search
3. Select a provider (DuckDuckGo works without a key)
4. For Tavily/Serper/Exa, enter the API key in the secrets section

### Setting Up MCP Servers

1. Navigate to the MCP page (hub icon in top ribbon)
2. Browse the marketplace or add a custom server
3. Configure required fields (paths, API keys)
4. Connect — the server appears in your chat `+` menu

### Using Consensus Engine

1. Navigate to Consensus (groups icon in top ribbon)
2. Add 2-5 council models
3. Select a synthesizer model
4. (Optional) Enable web search
5. Type your query and click "Run Consensus"

---

## Testing

```bash
# Unit tests (Vitest)
npm run test:unit

# End-to-end tests (Playwright)
npm run test:e2e
```

---

## Architecture

Electron app with three process layers:

```
┌─────────────────────────────────────────┐
│           Renderer Process              │
│    React 19 + Vite 6 + Tailwind v4     │
│   Chat, Consensus, Agents, Skills,     │
│   MCP, Settings, Sidebar               │
└────────────────────┬────────────────────┘
                     │ window.localmind.*
┌────────────────────▼────────────────────┐
│           Preload Script                │
│    contextBridge IPC API exposure       │
└────────────────────┬────────────────────┘
                     │ ipcMain.handle / webContents.send
┌────────────────────▼────────────────────┐
│            Main Process                 │
│  LLM Router, DB, MCP Host, RAG,        │
│  Web Search, File Handling, Settings    │
└─────────────────────────────────────────┘
```

### Source Layout

```
LocalMind/
├── src/
│   ├── main/                   # Electron main process
│   │   ├── index.ts            # App lifecycle, window management, global shortcut
│   │   ├── ipc.ts              # All IPC handler registrations
│   │   ├── llm/
│   │   │   ├── router.ts       # LLM provider dispatch + privacy mode enforcement
│   │   │   ├── streaming.ts    # Stream ID management + IPC chunk delivery
│   │   │   ├── token-counter.ts# tiktoken-based token counting
│   │   │   ├── auto-title.ts   # Auto-generate conversation titles
│   │   │   ├── tool-executor.ts# MCP tool execution during LLM calls
│   │   │   └── providers/      # ollama, openai, openrouter, google, custom
│   │   ├── mcp/
│   │   │   ├── host-manager.ts # MCP client lifecycle (connect/disconnect/tools/resources)
│   │   │   └── approval.ts     # Tool call approval system
│   │   ├── db/
│   │   │   ├── connection.ts   # sql.js in-memory SQLite with disk persistence
│   │   │   └── schema.ts       # Drizzle ORM schema definitions
│   │   ├── rag/
│   │   │   └── indexer.ts      # Document chunking + Vectra vector store
│   │   ├── websearch/
│   │   │   └── service.ts      # Tavily, Serper, Exa, DuckDuckGo providers
│   │   ├── skills/             # Skill loader + runner
│   │   ├── personas/           # Persona CRUD + template variable injection
│   │   ├── workspaces/         # Workspace management
│   │   ├── artifacts/          # Artifact save/version/export
│   │   ├── files/              # File extractor + URL fetcher
│   │   ├── data/               # Full data export/import (ZIP)
│   │   ├── claude-code/        # Claude Code proxy server
│   │   └── settings/
│   │       ├── app-store.ts    # electron-store for app settings
│   │       └── secrets.ts      # Encrypted API key storage
│   ├── preload/
│   │   └── index.ts            # contextBridge API (window.localmind.*)
│   ├── renderer/
│   │   ├── src/
│   │   │   ├── App.tsx         # Root layout + page routing
│   │   │   ├── components/
│   │   │   │   ├── chat/       # ChatView, ChatInput, MessageList, MessageBubble, ModelSelector
│   │   │   │   ├── consensus/  # ConsensusPage
│   │   │   │   ├── agents/     # AgentsPage, AgentPicker, AgentToolPermissionDialog
│   │   │   │   ├── skills/     # SkillsPage, SkillLauncher
│   │   │   │   ├── mcp/        # McpManagementPage, McpConfigEditor, McpPermissionDialog
│   │   │   │   ├── sidebar/    # Sidebar, ConversationList
│   │   │   │   ├── settings/   # SettingsPage, ConfigurationPage
│   │   │   │   ├── personas/   # PersonaPicker, PersonaLibrary
│   │   │   │   ├── artifacts/  # ArtifactPanel
│   │   │   │   ├── rag/        # RagPanel
│   │   │   │   ├── workspaces/ # WorkspaceSwitcher
│   │   │   │   └── ui/         # PageNavIcons, ToastContainer
│   │   │   ├── stores/         # Zustand state stores (chat, provider, settings, ui, consensus, etc.)
│   │   │   └── hooks/          # useStreaming, useDebounce, useNotification
│   │   └── index.html
│   └── shared/
│       └── types/              # Shared TypeScript interfaces (LocalMindAPI, LLMApi, etc.)
├── electron.vite.config.ts     # Build config (main + preload + renderer)
├── electron-builder.yml        # Packaging config (NSIS Windows installer)
├── package.json
└── CLAUDE.md                   # Development guidance for AI coding assistants
```

### Database Schema

Local SQLite via sql.js + Drizzle ORM:

| Table | Purpose |
|---|---|
| `conversations` | Chat sessions with title, model, workspace, starred flag |
| `messages` | Messages with role, content, tokens, streaming state |
| `artifacts` | Saved code/text with version history |
| `mcpServers` | MCP server configurations |
| `skills` | Custom skill definitions |
| `personas` | Assistant persona configurations |
| `providerConfigs` | Per-provider settings |
| `modelProfiles` | Named parameter profiles (temperature, maxTokens) |
| `pinnedFiles` | Files pinned to conversation context |
| `skillPipelines` | Multi-step skill chains |

---

## Tech Stack

| Category | Technology |
|---|---|
| Desktop Shell | Electron 35 |
| Frontend | React 19 + Vite 6 + Tailwind CSS v4 |
| Build Tool | electron-vite 3 |
| State Management | Zustand 5 |
| Database | sql.js (SQLite) + Drizzle ORM |
| Token Counting | tiktoken |
| Markdown | react-markdown + remark-gfm + rehype-highlight |
| Math Rendering | KaTeX (rehype-katex + remark-math) |
| Diagrams | Mermaid |
| Document Parsing | mammoth (Word), pdf-parse (PDF), xlsx (Excel) |
| RAG Vector Store | Vectra |
| MCP Integration | @modelcontextprotocol/sdk |
| Validation | Zod |
| Testing | Vitest + Playwright |
| Packaging | electron-builder (NSIS for Windows) |

---

## Privacy & Security

- **Privacy Mode** blocks all non-Ollama API calls at the router level
- API keys stored in a **separate encrypted electron-store** file
- All data stored **locally** in the system userData directory
- No telemetry, no analytics, no cloud sync
- MCP tool calls require user approval (unless auto-approved)
- Context isolation and sandboxed preload for renderer security

---

## Scripts Reference

| Command | Description |
|---|---|
| `npm run dev` | Start dev server with hot-reload |
| `npm run build` | Build all processes (main + preload + renderer) |
| `npm run preview` | Preview the production build |
| `npm run package` | Build + package as Windows installer |
| `npm run test:unit` | Run unit tests with Vitest |
| `npm run test:e2e` | Run E2E tests with Playwright |

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes and run tests: `npm run test:unit`
4. Commit with a descriptive message
5. Open a Pull Request

---

## License

This project is licensed under the MIT License. See the [LICENSE](./LICENSE) file for details.

---

<div align="center">
  Built by <a href="https://github.com/bharatsharma3092">Bharat Sharma</a>
</div>
