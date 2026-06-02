
# LocalMind Agentic Platform — PRD & TRD
### Inspired by OpenClaw | Built for Bharat Sharma | Version 1.0 | May 2026

---

# PART 1: PRODUCT REQUIREMENTS DOCUMENT (PRD)

---

## 1. Executive Summary

LocalMind is a privacy-first, locally-hosted personal AI agent platform that mirrors every
agentic capability of OpenClaw, powered by local/open-source LLMs (Ollama, LM Studio),
with optional OpenRouter API fallback. Unlike OpenClaw which is cloud-centric and proprietary,
LocalMind runs on the user's own machine and mobile devices with zero data leaving the device
by default.

**Vision:** "Your personal AI agent — always on, always private, always capable."

---

## 2. Problem Statement

Existing personal AI agents (OpenClaw, Personal AI, etc.) send all data to cloud servers,
require expensive API subscriptions, and cannot be customized at the infrastructure level.
For a QA engineer transitioning to Agentic AI, building LocalMind means:
- Full ownership of the agent runtime
- Ability to plug in any LLM (local or remote)
- Complete skill/plugin extensibility
- Privacy-by-default for sensitive automation

---

## 3. Target Users

| User Type         | Description                                     |
|-------------------|-------------------------------------------------|
| Primary           | Bharat Sharma — QA Lead / Agentic AI developer  |
| Secondary         | Developers who want a self-hosted AI assistant  |
| Tertiary          | Privacy-conscious power users                   |

---

## 4. Core Principles

- **Local-First:** All LLM inference via Ollama by default
- **Plugin Architecture:** Every skill is a standalone module (mirroring OpenClaw extensions/)
- **Multi-Model:** Route tasks to best model (local Mistral, Claude via OpenRouter, etc.)
- **Cross-Platform:** Windows/Linux primary, Android via Termux node
- **Zero Lock-In:** No single cloud provider dependency

---

## 5. Agentic Capability Domains (Mapped from OpenClaw Skills/)

### 5.1 MEMORY & KNOWLEDGE MANAGEMENT

| Capability        | OpenClaw Skill     | LocalMind Module          | Description                              |
|-------------------|--------------------|---------------------------|------------------------------------------|
| Notes (Apple)     | apple-notes        | localmind-notes           | Read/write/search notes in any app       |
| Notes (Bear)      | bear-notes         | localmind-notes           | Bear/Obsidian-compatible markdown notes  |
| Notes (Obsidian)  | obsidian           | localmind-obsidian        | Full Obsidian vault CRUD + search        |
| Notes (Notion)    | notion             | localmind-notion          | Notion DB + page create/update/search    |
| Oracle (RAG)      | oracle             | localmind-oracle          | RAG over personal knowledge base         |
| Session Logs      | session-logs       | localmind-sessions        | Store + replay agent conversation logs   |
| Summarize         | summarize          | localmind-summarize       | Summarize URLs, docs, files, emails      |
| Blog Watcher      | blogwatcher        | localmind-blogwatcher     | Monitor RSS/blogs, digest on schedule    |

### 5.2 TASK & PROJECT MANAGEMENT

| Capability        | OpenClaw Skill           | LocalMind Module           | Description                           |
|-------------------|--------------------------|----------------------------|---------------------------------------|
| Task Flow         | taskflow                 | localmind-taskflow         | Personal GTD task management system   |
| Inbox Triage      | taskflow-inbox-triage    | localmind-inbox-triage     | AI-powered email/task inbox sorting   |
| Reminders         | apple-reminders          | localmind-reminders        | Create/manage OS-level reminders      |
| Trello            | trello                   | localmind-trello           | Trello board read/write/move cards    |
| Things (Mac)      | things-mac               | localmind-things           | Things3 task management integration   |
| Order CLI         | ordercli                 | localmind-ordercli         | Orchestrate multi-step agent commands |

### 5.3 CODING & DEVELOPMENT AGENT

| Capability        | OpenClaw Skill           | LocalMind Module           | Description                             |
|-------------------|--------------------------|----------------------------|-----------------------------------------|
| Coding Agent      | coding-agent             | localmind-coder            | Full coding agent: write/run/debug code |
| GitHub Issues     | gh-issues                | localmind-github           | Read/create/triage GitHub issues & PRs  |
| GitHub Integration| github                   | localmind-github           | Full GitHub API agent operations        |
| Node Debugger     | node-inspect-debugger    | localmind-debugger         | Node.js live debugging via inspect      |
| Python Debugger   | python-debugpy           | localmind-debugger         | Python debugpy attach + step through    |
| Node Connect      | node-connect             | localmind-node-connect     | Connect to live Node.js runtime         |
| TMUX              | tmux                     | localmind-tmux             | Create/manage tmux sessions + send cmds |
| Spike (Research)  | spike                    | localmind-spike            | Research + synthesize technical topics  |

### 5.4 VOICE & MEDIA

| Capability        | OpenClaw Skill           | LocalMind Module           | Description                             |
|-------------------|--------------------------|----------------------------|-----------------------------------------|
| Voice Call        | voice-call               | localmind-voice            | Voice I/O with real-time STT/TTS        |
| Whisper (local)   | openai-whisper           | localmind-whisper          | Local Whisper.cpp STT transcription     |
| Whisper (API)     | openai-whisper-api       | localmind-whisper          | Cloud Whisper API fallback              |
| TTS (ONNX)        | sherpa-onnx-tts          | localmind-tts              | Local offline TTS via Sherpa-ONNX       |
| Camera Snap       | camsnap                  | localmind-camera           | Capture + analyze webcam/phone images   |
| Video Frames      | video-frames             | localmind-video            | Extract + analyze video frames          |
| GIF Grep          | gifgrep                  | localmind-gifgrep          | Search GIFs by description/content      |
| Meme Maker        | meme-maker               | localmind-mememaker        | Generate memes with text overlay        |

### 5.5 VISUAL & CANVAS

| Capability        | OpenClaw Skill     | LocalMind Module          | Description                               |
|-------------------|--------------------|---------------------------|-------------------------------------------|
| Canvas            | canvas             | localmind-canvas          | AI visual whiteboard + diagram workspace  |
| Diagram Maker     | diagram-maker      | localmind-diagrams        | Generate Mermaid/PlantUML diagrams        |
| PDF (Nano)        | nano-pdf           | localmind-pdf             | Read, extract, annotate PDF files         |

### 5.6 SMART HOME & IoT

| Capability        | OpenClaw Skill     | LocalMind Module          | Description                               |
|-------------------|--------------------|---------------------------|-------------------------------------------|
| Philips Hue       | openhue            | localmind-smarthome       | Control Hue lights (on/off/color/scenes)  |
| Sonos             | sonoscli           | localmind-sonos           | Control Sonos speakers + playlists        |
| Spotify           | spotify-player     | localmind-spotify         | Play/pause/search Spotify tracks          |
| Song Detect       | songsee            | localmind-songsee         | Identify currently playing song           |

### 5.7 SYSTEM & INFRASTRUCTURE

| Capability        | OpenClaw Skill     | LocalMind Module          | Description                               |
|-------------------|--------------------|---------------------------|-------------------------------------------|
| Health Check      | healthcheck        | localmind-healthcheck     | Monitor system + service uptime/health    |
| Gemini            | gemini             | localmind-providers       | Route tasks to Gemini model               |
| Model Usage       | model-usage        | localmind-model-usage     | Track token usage + cost per model        |
| MCP Porter        | mcporter           | localmind-mcp             | Import/use any MCP server as a skill      |
| Eight Control     | eightctl           | localmind-eightctl        | Multi-node agent coordination/control     |
| Blu CLI           | blucli             | localmind-blucli          | Bluetooth device control CLI              |
| Go Places         | goplaces           | localmind-goplaces        | Location-aware agent actions              |
| GOG               | gog                | localmind-gog             | Game library management + launcher        |

### 5.8 EMAIL, COMMUNICATION & SEARCH

| Capability        | OpenClaw Skill     | LocalMind Module          | Description                               |
|-------------------|--------------------|---------------------------|-------------------------------------------|
| Email (Himalaya)  | himalaya           | localmind-email           | Read/send/triage email via Himalaya CLI   |
| iMessage          | imsg               | localmind-imsg            | Read/send iMessages (macOS)               |
| Slack             | slack              | localmind-slack           | Post/read Slack messages + channel search |
| URL Fetch         | xurl               | localmind-xurl            | Fetch/analyze any URL content             |
| Weather           | weather            | localmind-weather         | Get weather forecasts for any location    |

### 5.9 IDENTITY & SECURITY

| Capability        | OpenClaw Skill     | LocalMind Module          | Description                               |
|-------------------|--------------------|---------------------------|-------------------------------------------|
| 1Password         | 1password          | localmind-secrets         | Secure credential lookup via 1Password    |
| Claw Hub          | clawhub            | localmind-hub             | Central plugin/skill registry + discovery |
| Skill Creator     | skill-creator      | localmind-skill-creator   | AI-assisted skill authoring + scaffolding |
| SAG               | sag                | localmind-sag             | Sub-agent spawner + coordinator           |
| Peekaboo          | peekaboo           | localmind-peekaboo        | Screen capture + visual analysis          |

---

## 6. User Stories (Priority: P0 = MVP, P1 = Phase 2, P2 = Phase 3)

| ID    | Story                                                                 | Priority |
|-------|-----------------------------------------------------------------------|----------|
| US-01 | As Bharat, I want to ask LocalMind to write and run Python tests      | P0       |
| US-02 | As Bharat, I want to read/write my Obsidian vault via voice           | P0       |
| US-03 | As Bharat, I want LocalMind to triage my GitHub issues automatically  | P0       |
| US-04 | As Bharat, I want the agent to summarize any URL I paste              | P0       |
| US-05 | As Bharat, I want to spawn sub-agents for parallel task execution     | P0       |
| US-06 | As Bharat, I want to ask questions over my local knowledge base (RAG) | P0       |
| US-07 | As Bharat, I want full voice interaction with local STT/TTS           | P1       |
| US-08 | As Bharat, I want to control smart home devices with natural language  | P1       |
| US-09 | As Bharat, I want to create new skills/plugins via natural language   | P1       |
| US-10 | As Bharat, I want the agent to debug my running Node.js app           | P1       |
| US-11 | As Bharat, I want health monitoring of all my local services          | P1       |
| US-12 | As Bharat, I want to use ANY MCP server as a LocalMind skill          | P2       |
| US-13 | As Bharat, I want multi-node agent control (laptop + phone)           | P2       |
| US-14 | As Bharat, I want canvas/visual whiteboard from the agent             | P2       |

---

## 7. MVP Scope (Phase 1 — 3 Months)

**Core Runtime:** Gateway + Plugin loader + LLM router  
**P0 Skills:** coding-agent, obsidian/oracle, github, summarize, taskflow,
              healthcheck, tmux, xurl, weather, session-logs

---

## 8. Success Metrics

| Metric                       | Target           |
|------------------------------|------------------|
| Skills implemented           | 20+ (all 50 eventually) |
| Local LLM response latency   | < 3s for simple tasks   |
| Skill invocation accuracy    | > 90% correct routing   |
| Memory/context retention     | Session + long-term      |
| Zero cloud calls (default)   | 100% local mode          |

---

# PART 2: TECHNICAL REQUIREMENTS DOCUMENT (TRD)

---

## 1. System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        LocalMind Platform                           │
│                                                                     │
│  ┌──────────────┐   ┌──────────────┐   ┌───────────────────────┐  │
│  │  Interface   │   │   Gateway    │   │    LLM Router         │  │
│  │  Layer       │──>│   Core       │──>│  Ollama / OpenRouter  │  │
│  │  (REST/WS/   │   │  (Node.js    │   │  / Claude / Gemini    │  │
│  │   CLI/UI)    │   │   TypeScript)│   │  (Provider plugins)   │  │
│  └──────────────┘   └──────┬───────┘   └───────────────────────┘  │
│                             │                                        │
│                    ┌────────▼────────┐                              │
│                    │  Plugin Loader  │                              │
│                    │  (Skills/       │                              │
│                    │   Extensions)   │                              │
│                    └────────┬────────┘                              │
│                             │                                        │
│   ┌─────────┬───────────────┼───────────────┬──────────────────┐   │
│   │  Memory │  Tool Skills  │  Agent Skills │  System Skills   │   │
│   │  Layer  │  (50+ modules)│  (SAG,Coder)  │  (Tmux,Health)  │   │
│   │  (RAG + │               │               │                  │   │
│   │   KV)   │               │               │                  │   │
│   └─────────┴───────────────┴───────────────┴──────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Technology Stack

### 2.1 Core Runtime

| Component          | Technology              | Rationale                                    |
|--------------------|-------------------------|----------------------------------------------|
| Runtime            | Node.js 22+ (TypeScript)| Matches OpenClaw; ESM + strict TS            |
| Package Manager    | pnpm (workspaces)       | Monorepo management for skills               |
| LLM (local)        | Ollama HTTP API         | Local inference; qwen3, mistral, llama3.3    |
| LLM (remote)       | OpenRouter API          | Cloud fallback; multi-model routing          |
| Gateway            | Fastify + WebSocket     | Low-latency REST + streaming                 |
| Plugin SDK         | Custom TS SDK (plugin-sdk)| Mirrors OpenClaw plugin-sdk architecture   |
| Task Queue         | BullMQ + Redis (local)  | Async skill execution + retries              |
| Vector DB          | ChromaDB (local)        | RAG / Oracle skill embedding store           |
| Embedding Model    | nomic-embed-text (Ollama)| Local embeddings, no cloud                 |
| Config             | YAML + Zod schema       | Typed config with validation                 |

### 2.2 Skill-Specific Tech

| Skill Domain        | Tech                              |
|---------------------|-----------------------------------|
| STT (local)         | whisper.cpp (binary) or faster-whisper |
| TTS (local)         | sherpa-onnx-tts binary            |
| Voice I/O           | PortAudio / node-record-lpcm      |
| PDF processing      | pdf-parse / poppler               |
| Image analysis      | LLaVA via Ollama (multimodal)     |
| Screen capture      | Playwright screenshot / scrot     |
| Video frames        | FFmpeg + sharp                    |
| Browser automation  | Playwright (headed/headless)      |
| Terminal sessions   | node-pty + tmux CLI               |
| Email               | Himalaya CLI + IMAP               |
| GitHub              | @octokit/rest                     |
| Notion              | @notionhq/client                  |
| Obsidian            | File system + markdown-it         |
| Smart home          | node-hue-api / openHue CLI        |
| Spotify             | spotify-web-api-node              |
| Diagrams            | Mermaid CLI + PlantUML            |
| MCP Bridge          | @modelcontextprotocol/sdk         |

---

## 3. Repository Structure (Monorepo)

```
localmind/
├── src/
│   ├── gateway/              # Core Gateway server
│   │   ├── server.ts         # Fastify HTTP + WS server
│   │   ├── router.ts         # Request routing
│   │   ├── protocol/         # WebSocket protocol types
│   │   └── agents/           # Agent loop + orchestration
│   ├── channels/             # Input channel handlers
│   │   ├── rest/             # REST API channel
│   │   ├── cli/              # CLI channel
│   │   └── ui/               # Web UI channel
│   ├── plugin-sdk/           # Public SDK for skill authors
│   │   ├── index.ts          # Barrel export
│   │   ├── types.ts          # SkillManifest, ToolDef, etc.
│   │   └── helpers.ts        # Common skill utilities
│   ├── plugins/              # Plugin loader + registry
│   │   ├── loader.ts         # Discover + load skills
│   │   └── registry.ts       # Skill catalog
│   └── providers/            # LLM provider adapters
│       ├── ollama.ts         # Ollama provider
│       ├── openrouter.ts     # OpenRouter provider
│       └── anthropic.ts      # Direct Claude provider
├── skills/                   # All 50 agentic skills
│   ├── oracle/               # RAG knowledge base
│   ├── coding-agent/         # Code write/run/debug
│   ├── obsidian/             # Obsidian vault
│   ├── github/               # GitHub agent
│   ├── taskflow/             # Task management
│   ├── voice-call/           # Voice I/O
│   ├── tmux/                 # Terminal sessions
│   ├── summarize/            # Content summarization
│   ├── healthcheck/          # Service monitoring
│   ├── canvas/               # Visual workspace
│   ├── diagram-maker/        # Diagram generation
│   ├── nano-pdf/             # PDF reader
│   ├── peekaboo/             # Screen capture
│   ├── camsnap/              # Camera capture
│   ├── video-frames/         # Video analysis
│   ├── openai-whisper/       # Local STT
│   ├── sherpa-onnx-tts/      # Local TTS
│   ├── notion/               # Notion integration
│   ├── trello/               # Trello boards
│   ├── gh-issues/            # GitHub Issues
│   ├── blogwatcher/          # RSS monitor
│   ├── himalaya/             # Email
│   ├── slack/                # Slack
│   ├── xurl/                 # URL fetch/analyze
│   ├── weather/              # Weather
│   ├── openhue/              # Philips Hue
│   ├── sonoscli/             # Sonos
│   ├── spotify-player/       # Spotify
│   ├── node-inspect-debugger/# Node.js debugger
│   ├── python-debugpy/       # Python debugger
│   ├── node-connect/         # Node runtime connect
│   ├── sag/                  # Sub-agent spawner
│   ├── skill-creator/        # Skill authoring AI
│   ├── mcporter/             # MCP bridge
│   ├── model-usage/          # Token usage tracker
│   ├── session-logs/         # Session history
│   ├── 1password/            # Credential manager
│   ├── spike/                # Research agent
│   ├── meme-maker/           # Meme generation
│   ├── gifgrep/              # GIF search
│   ├── ordercli/             # Multi-step orchestration
│   ├── blucli/               # Bluetooth control
│   ├── goplaces/             # Location agent
│   ├── eightctl/             # Multi-node control
│   ├── gog/                  # Game library
│   └── clawhub/              # Skill hub/registry
├── ui/                       # LocalMind Web UI (React/Vite)
├── apps/
│   └── android/              # Android Termux node
├── packages/
│   ├── config/
│   ├── logger/
│   └── types/
├── docs/
├── test/
├── scripts/
├── pnpm-workspace.yaml
├── package.json
└── tsconfig.json
```

---

## 4. Plugin SDK Contract

```typescript
export interface SkillManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  capabilities: CapabilityFamily[];
  tools: ToolDefinition[];
  setup?: () => Promise<void>;
  teardown?: () => Promise<void>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ZodSchema;
  execute: (params: unknown, ctx: SkillContext) => Promise<ToolResult>;
}

export interface SkillContext {
  llm: LLMRouter;
  memory: MemoryStore;
  logger: Logger;
  config: Record<string, unknown>;
  spawnAgent?: (prompt: string) => Promise<AgentResult>;
}
```

---

## 5. LLM Router Design

```typescript
class LLMRouter {
  async complete(req: LLMRequest): Promise<LLMResponse> {
    const model = this.selectModel(req.taskType, req.preferLocal);
    if (model.provider === 'ollama') return this.ollama.complete(req);
    if (model.provider === 'openrouter') return this.openrouter.complete(req);
    if (model.provider === 'anthropic') return this.anthropic.complete(req);
  }

  // Routing table:
  // coding tasks      → qwen2.5-coder:32b (local) or claude-sonnet (remote)
  // vision tasks      → llava:34b (local) or claude-3.5-sonnet (remote)
  // embedding         → nomic-embed-text (local always)
  // general chat      → qwen3:14b (local) or mistral-large (remote)
  // long context      → llama3.3:70b (local) or gemini-2.5-pro (remote)
}
```

---

## 6. Memory Architecture (Oracle Skill)

```
User Query
    │
    ▼
┌─────────────────────────────────────────┐
│           Oracle (RAG) Skill            │
│                                         │
│  1. Embed query (nomic-embed-text)      │
│  2. Search ChromaDB (top-k=10)          │
│  3. Re-rank results                     │
│  4. Inject context into LLM prompt      │
│  5. Return grounded answer              │
└─────────────────────────────────────────┘
    │
    ▼
Knowledge Sources:
  ├── Obsidian vault (markdown → chunks)
  ├── PDF files (nano-pdf → chunks)
  ├── Blog watch summaries
  ├── Session logs
  └── GitHub wiki / issues
```

---

## 7. Sub-Agent Spawner (SAG Skill)

```typescript
class SAGSkill {
  async execute(goal: string, ctx: SkillContext): Promise<AgentResult> {
    const plan = await this.planDecomposition(goal, ctx.llm);
    const agents = plan.steps.map(step =>
      ctx.spawnAgent({
        goal: step.description,
        skills: step.requiredSkills,
        timeout: step.estimatedMs,
      })
    );
    const results = await Promise.allSettled(agents);
    return this.synthesizeResults(results, ctx.llm);
  }
}
```

---

## 8. Development Phases

### Phase 1 — Core Runtime (Month 1-2)
- [ ] Gateway server (Fastify + WebSocket)
- [ ] Plugin loader + SDK
- [ ] LLM Router (Ollama + OpenRouter)
- [ ] Memory store (ChromaDB + KV)
- [ ] CLI channel
- [ ] Skills: oracle, coding-agent, obsidian, github, summarize, taskflow, healthcheck, tmux, xurl, weather, session-logs

### Phase 2 — Media + Voice (Month 3-4)
- [ ] Voice pipeline (whisper.cpp + sherpa-onnx-tts)
- [ ] Camera + screen capture (camsnap + peekaboo)
- [ ] Video frame analysis
- [ ] PDF + diagram skills
- [ ] Canvas skill
- [ ] Skills: voice-call, openai-whisper, sherpa-onnx-tts, nano-pdf, camsnap, video-frames, diagram-maker, canvas, peekaboo

### Phase 3 — Integrations (Month 5-6)
- [ ] Email (himalaya), Slack, Notion, Trello
- [ ] GitHub Issues agent
- [ ] Smart home (openhue, sonoscli, spotify)
- [ ] Debuggers (node + python)
- [ ] MCP porter (bridge any MCP server)
- [ ] Sub-agent spawner (SAG)
- [ ] Skill creator AI

### Phase 4 — Mobile + Polish (Month 7-8)
- [ ] Android Termux node
- [ ] Web UI (LocalMind UI)
- [ ] Multi-node control (eightctl)
- [ ] All remaining skills (50 total)
- [ ] Security hardening + secrets management
- [ ] Performance optimization

---

## 9. Key Technical Constraints & Decisions

| Constraint                        | Decision                                       |
|-----------------------------------|------------------------------------------------|
| TypeScript ESM strict             | Matches OpenClaw; best TS practices            |
| No localStorage/sessionStorage    | In-memory state; file-backed persistence       |
| Plugin cross-imports forbidden    | Skills import only from plugin-sdk barrel      |
| Hot paths: no stat/realpath reads | Cache manifests at startup; reload on demand   |
| Zod for all external inputs       | Type-safe skill parameter validation           |
| pnpm workspaces                   | Monorepo; each skill = independent package     |
| Vitest for tests                  | Co-located *.test.ts per skill                 |
| oxlint + oxfmt                    | Fast Rust-based linting + formatting           |

---

## 10. Security Model

```
~/.localmind/
├── credentials/           # Per-service API keys (encrypted at rest)
│   ├── github.json
│   ├── notion.json
│   └── openrouter.json
├── agents/
│   └── <agentId>/
│       └── auth-profiles.json
├── data/
│   ├── chroma/            # Vector DB files
│   └── sessions/          # Session logs
└── config.yaml            # Main config (no secrets)
```

**Rules:**
- Secrets NEVER in config.yaml or committed to git
- All external API calls logged with opt-in telemetry only
- MCP servers run in sandboxed child processes
- Sub-agents have scoped skill permissions only

---

## 11. LocalMind vs OpenClaw Comparison

| Dimension            | OpenClaw             | LocalMind                          |
|----------------------|----------------------|------------------------------------|
| LLM hosting          | Cloud (Claude etc.)  | Local-first (Ollama) + cloud opt-in|
| Skill count          | 50+ (growing)        | 50 planned (full parity)           |
| Privacy              | Cloud-dependent      | 100% local default                 |
| Mobile               | iOS/Android node     | Android Termux node (Phase 4)      |
| Cost                 | Subscription         | Free (local compute)               |
| Customization        | Limited              | Full (open source monorepo)        |
| Plugin SDK           | TS (proprietary)     | TS (open, MIT license)             |
| Voice                | Cloud STT/TTS        | Local whisper.cpp + sherpa-onnx    |
| RAG/Memory           | Oracle (cloud)       | ChromaDB + Ollama embeddings       |
| MCP Support          | mcporter skill       | mcporter skill + native bridge     |

---

*Document prepared for: Bharat Sharma — LocalMind Project*  
*Date: May 2026 | Version: 1.0*  
*OpenClaw skills reference: https://github.com/openclaw/openclaw/tree/main/skills*
