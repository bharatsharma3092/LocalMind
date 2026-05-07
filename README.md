## License

This project is licensed under the MIT License. See the [LICENSE](./LICENSE) file for details.

# 🧠 LocalMind

> **Privacy-first local AI desktop application** — Chat with local and cloud LLMs from a beautiful Electron + React interface, with full conversation history, streaming responses, multi-provider support, and a built-in knowledge base architecture.

---

## ✨ What Can LocalMind Do?

### 🤖 Multi-Provider LLM Chat
- **Ollama (Local)** — Run fully offline with any model pulled via Ollama (Llama, Mistral, Qwen, DeepSeek, Phi, etc.)
- **OpenAI** — GPT-4, GPT-4o, GPT-4o-mini, and more
- **OpenRouter** — Access 200+ models via a single API key
- **Google Gemini** — Gemini 2.5, 2.0 Flash, Pro variants
- **Custom Providers** — Any OpenAI-compatible endpoint (LM Studio, vLLM, Groq, Together AI, etc.)

### 🔒 Privacy Mode
- Toggle **Privacy Mode** to block all cloud providers instantly — only Ollama (local) requests are allowed when enabled
- Your API keys are stored **encrypted** using a separate electron-store secrets file, never in plaintext

### 💬 Streaming Conversations
- Real-time streaming responses with chunk-by-chunk rendering
- **Auto-generated conversation titles** after the first assistant reply
- Full **conversation history** stored in a local SQLite database (sql.js)
- Create, rename, and delete conversations from the sidebar

### 🔢 Token Counting
- Live token counting using **tiktoken** for accurate context usage display
- Helps you track how much context you're using per conversation

### 🎨 Rich Message Rendering
- **Markdown** rendering with GitHub Flavored Markdown (GFM)
- **Syntax highlighted code blocks** via rehype-highlight
- **LaTeX / math** rendering with KaTeX
- **Mermaid diagrams** rendered inline

### ⚙️ Settings & Customization
- Light / Dark / System theme support
- Provider configuration (API keys, base URLs, model selection) per provider
- Persistent window state (size, position remembered across sessions)
- Global keyboard shortcut **`Ctrl+Shift+Space`** to instantly focus/open the app from anywhere
- Single-instance lock — only one app window runs at a time

### 🗄️ Local Database
- All conversations, messages, and settings stored in **`localmind.db`** in your system's userData folder
- No cloud sync — your data stays entirely on your machine
- SQLite via sql.js with Drizzle ORM schema management

---

## 🚀 Getting Started

### Prerequisites

Make sure you have the following installed:

| Requirement | Version | Purpose |
|---|---|---|
| **Node.js** | 18+ | Runtime for build tooling |
| **npm** | 8+ | Package management |
| **Ollama** *(optional)* | Latest | For local model inference |
| **Git** | Any | Clone the repository |

> **For cloud providers** (OpenAI, Google, OpenRouter): you'll need the respective API keys, configured in Settings after launch.

---

### Installation

**1. Clone the repository**
```bash
git clone https://github.com/bharatsharma3092/LocalMind.git
cd LocalMind
```

**2. Install dependencies**
```bash
npm install
```

**3. (Optional) Set up Ollama for local models**

Install Ollama from [https://ollama.com](https://ollama.com), then pull a model:
```bash
ollama pull llama3.2
# or
ollama pull qwen2.5-coder
# or
ollama pull mistral
```

---

### Running the App

#### Development Mode (with hot-reload)
```bash
npm run dev
```
This starts the Electron app with a live-reloading dev server. Any changes to `src/` will auto-refresh.

#### Production Build
```bash
npm run build
```
Builds the main process, preload, and renderer via electron-vite.

#### Preview Built App
```bash
npm run preview
```

#### Package as Installer (Windows NSIS)
```bash
npm run package
```
Creates a distributable installer in the `dist/` folder.

---

### First Launch

1. **Launch the app** with `npm run dev` or open the packaged installer
2. **Select a provider** — If you have Ollama running, it auto-detects local models
3. **Add API keys** — Go to ⚙️ **Settings → Providers** and enter keys for OpenAI / Google / OpenRouter as needed
4. **Pick a model** — Use the model selector dropdown at the top of the chat
5. **Start chatting!** — Type a message and press Enter or click Send

---

## 🏗️ Architecture Overview

LocalMind is an **Electron desktop app** built with three distinct process layers:

```
┌─────────────────────────────────────┐
│          Renderer Process           │
│   React 19 + Vite + Tailwind v4    │
│  (Chat UI, Settings, Sidebar, etc.) │
└────────────────┬────────────────────┘
                 │ window.localmind.*  (contextBridge)
┌────────────────▼────────────────────┐
│          Preload Script             │
│   Exposes safe IPC bridge API       │
└────────────────┬────────────────────┘
                 │ ipcMain.handle / webContents.send
┌────────────────▼────────────────────┐
│           Main Process              │
│  Node.js: LLM routing, DB, settings │
│  Five LLM providers, streaming      │
└─────────────────────────────────────┘
```

### Key Source Folders

| Folder | Description |
|---|---|
| `src/main/` | Electron main process — app lifecycle, IPC handlers, LLM routing, DB, settings |
| `src/preload/` | Context bridge — exposes `window.localmind` API to renderer safely |
| `src/renderer/` | React 19 frontend — Chat UI, Sidebar, Settings, Zustand stores |
| `src/shared/` | Shared TypeScript type definitions used across all layers |

### LLM Providers

| Provider | File | Notes |
|---|---|---|
| Ollama | `src/main/llm/providers/ollama.ts` | Local, privacy-mode safe |
| OpenAI | `src/main/llm/providers/openai.ts` | Requires API key |
| OpenRouter | `src/main/llm/providers/openrouter.ts` | 200+ models via single key |
| Google | `src/main/llm/providers/google.ts` | Gemini models |
| Custom | `src/main/llm/providers/custom.ts` | Any OpenAI-compatible endpoint |

### Database Schema (Drizzle ORM + sql.js)

The local SQLite database stores:
- `conversations` — Chat sessions with title, model, workspace, starred flag
- `messages` — Individual messages with role, content, tokens, branch support
- `artifacts` — Saved code/text artifacts with version history
- `mcpServers` — Saved MCP server configurations
- `skills` — Custom AI skill definitions
- `personas` — Named assistant personas with system prompts
- `providerConfigs` — Per-provider model and endpoint settings
- `modelProfiles` — Named model parameter profiles (temperature, maxTokens)
- `pinnedFiles` — Files pinned to conversation context
- `skillPipelines` — Multi-step skill chains

---

## 🧪 Testing

```bash
# Unit tests (Vitest)
npm run test:unit

# End-to-end tests (Playwright)
npm run test:e2e
```

---

## 📦 Tech Stack

| Category | Technology |
|---|---|
| Desktop Shell | Electron 35 |
| Frontend | React 19 + Vite 6 + Tailwind CSS v4 |
| Build Tool | electron-vite 3 |
| State Management | Zustand 5 |
| Database | sql.js (SQLite) + Drizzle ORM |
| Token Counting | tiktoken |
| Markdown | react-markdown + remark-gfm |
| Math Rendering | KaTeX |
| Diagram Rendering | Mermaid |
| Document Parsing | mammoth (Word), pdf-parse, xlsx |
| RAG Vector Store | Vectra |
| MCP SDK | @modelcontextprotocol/sdk |
| Validation | Zod |
| Testing | Vitest + Playwright |
| Packaging | electron-builder (NSIS for Windows) |

---

## 🗺️ Roadmap & Upcoming Features

The backend IPC handlers for these features are fully implemented — UI integration is in progress:

| Priority | Feature | Status |
|---|---|---|
| 🟡 P2 | Workspaces (multi-project context) | Backend ready, UI pending |
| 🟡 P2 | Artifacts Panel (save & version code snippets) | Backend ready, UI pending |
| 🟢 P3 | Conversation Starring / Pinning | Backend ready, UI pending |
| 🔵 P4 | Message Branching (regenerate from any point) | Backend ready, UI pending |
| 🔵 P4 | Model Profiles (named temperature/token configs) | Schema ready, UI pending |

---

## 📁 Project Structure

```
LocalMind/
├── src/
│   ├── main/               # Electron main process
│   │   ├── index.ts        # App lifecycle & window management
│   │   ├── ipc.ts          # All IPC handler registrations
│   │   ├── llm/            # LLM router + 5 providers + streaming
│   │   ├── db/             # sql.js connection + Drizzle schema
│   │   └── settings/       # App store + encrypted secrets
│   ├── preload/
│   │   └── index.ts        # Context bridge (window.localmind API)
│   ├── renderer/
│   │   ├── App.tsx         # Root layout
│   │   ├── components/     # Chat, Sidebar, Settings UI components
│   │   ├── stores/         # Zustand state stores
│   │   └── hooks/          # useStreaming, useDebounce, etc.
│   └── shared/
│       └── types/          # Shared TypeScript interfaces
├── electron.vite.config.ts # Build configuration
├── electron-builder.yml    # Packaging configuration
├── package.json
├── CLAUDE.md               # Development guidance for Claude Code
├── AGENTS.md               # Agent-specific project instructions
└── MISSING_FEATURES.md     # Backend-ready features pending UI wiring
```

---

## 🔐 Privacy & Security

- **Privacy Mode** blocks all non-Ollama API calls at the LLM router level — enforced in the main process
- API keys are stored in a **separate encrypted electron-store** file, never in the main config
- All data (conversations, messages, settings) is stored **locally** in your system's userData directory
- No telemetry, no analytics, no cloud sync — ever

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes and run tests: `npm run test:unit`
4. Commit with a descriptive message
5. Open a Pull Request

See [`MISSING_FEATURES.md`](./MISSING_FEATURES.md) for a detailed list of features ready to be built — great starting points for contributions!

---

## 📄 License

This project is private. All rights reserved © Bharat Sharma.

---

<div align="center">
  Built with ❤️ by <a href="https://github.com/bharatsharma3092">Bharat Sharma</a> — QA Engineer turned Agentic AI Builder
</div>
