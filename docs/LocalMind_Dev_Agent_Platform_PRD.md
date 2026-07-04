# LocalMind Dev Agent Platform — PRD

**Version:** 1.0  
**Date:** June 10, 2026  
**Author:** Bharat Sharma  
**Status:** Draft

---

## Overview

LocalMind Dev Agent Platform is a local-first, multi-model, agentic coding and automation environment that combines Claude Code's orchestration and workflow model with OpenCode's provider flexibility and tool transparency. The product turns LocalMind into a developer operating system for agentic work — users open a repo or workspace, select a model policy, give a goal, and LocalMind plans, executes, asks for approvals when needed, and keeps a full task and memory trail.

LocalMind already operates as the shell, model router, memory layer, and control UI with support for OpenAI-compatible APIs, Google Gemini, and local/cloud Ollama models. This PRD defines the features required to evolve it into a production-grade agentic coding and automation platform.

---

## Problem Statement

Developers and AI builders want one system that can:
- Understand a repository and plan tasks autonomously
- Execute multi-file code changes with tests and CI awareness
- Use tools safely with strong permission controls
- Run multiple coordinated agents for complex work
- Remember project conventions across every session
- Work with any model stack — local, cloud, or hybrid

Existing products force a tradeoff: Claude Code is polished and powerful but locked to Anthropic models and closed in architecture. OpenCode is open and flexible but lacks the orchestration depth and ecosystem depth of Claude Code. LocalMind should eliminate that tradeoff.

---

## Vision

> "LocalMind is the agentic platform that knows your codebase, remembers your conventions, executes with any model, and keeps you in control."

LocalMind should feel like a developer operating system for agentic work — not a chatbot with a code block. Every session is aware of repo context, every tool invocation is logged, every agent run can be audited, and every model choice is yours.

---

## Target Users

| User Type | Primary Need |
|---|---|
| AI/Automation Engineers | Agentic task execution, multi-agent orchestration, MCP tool use |
| QA Engineers | Test generation, regression diagnosis, CI triage, Playwright automation |
| Indie Builders | Local-first privacy, Ollama models, fast iteration |
| Model Experimenters | Provider-agnostic routing, benchmark/eval workflows |
| Full-Stack Developers | Repo understanding, multi-file refactor, PR automation |

---

## Feature Pillars

### 1. Workspace and Project Understanding

LocalMind opens one or more repositories, indexes them, and maintains project context over time. This covers repo structure scanning, language/stack detection, multi-root workspace support, and project onboarding.

**Requirements:**
- Project onboarding flow that scans repo structure, detects language and tools, and creates `LOCALMIND.md` plus optional `.localmind/rules/`
- Multi-root workspace support for monorepos and linked repos
- Repo map generation covering directories, packages, commands, entry points, and test suites
- Context modes: quick scan, deep scan, selective scan
- Import existing `CLAUDE.md` or `AGENTS.md` and map them into LocalMind memory and rules

---

### 2. Agent Memory and Instructions

A three-tier memory system ensures LocalMind never loses project context across sessions.

**Memory hierarchy:**

| Layer | Scope | Persistence |
|---|---|---|
| `LOCALMIND.md` | Project-level always-on instructions | Permanent until edited |
| `.localmind/rules/` | Path-scoped or language-scoped rules | Permanent until edited |
| Auto-memory | Learned commands, findings, preferences | Session → promoted to persistent on review |
| Session memory | Current session state and reasoning trail | Session only |
| User-global memory | Cross-project preferences and defaults | Permanent |

**Requirements:**
- Memory review UI: accept, edit, or delete learned memories before promotion
- Import compatibility with `CLAUDE.md` and `AGENTS.md` formats
- Memory search and audit view
- Cross-project memory for user-level preferences

---

### 3. Built-in Tool System

LocalMind ships with a first-class tool runtime that covers both coding and agentic operations. This merges the tool inventories of Claude Code and OpenCode into a unified, permission-aware toolkit.

**Core built-in tools:**

| Category | Tools |
|---|---|
| File Operations | `read`, `write`, `edit`, `patch`, `diff`, `checkpoint`, `undo_redo` |
| Search | `grep`, `glob`, `semantic_search`, `repo_map`, `symbol_search` |
| Code Intelligence | LSP: go-to-definition, references, hover, symbols, diagnostics |
| Execution | `bash`, `test_runner`, `linter`, `formatter`, `package_manager` |
| Web | `webfetch`, `websearch`, `docs_lookup`, `structured_extract` |
| Planning | `todo_graph`, `plan_mode`, `review_mode`, `execution_journal` |
| User Interaction | `question`, `approval_prompt`, `decision_prompt` |
| Git | `git_status`, `git_diff`, `git_branch`, `git_commit`, `pr_gen` |
| QA / Browser | `playwright_run`, `browser_control`, `test_artifact_collector` |
| Agent Tools | `subagent_spawn`, `team_message`, `background_job`, `scheduler` |
| MCP / Custom | MCP client, custom tool loader, tool schema validator |
| Session / Sharing | `session_export`, `run_replay`, `artifact_viewer`, `session_share` |

---

### 4. Skills and Slash Workflows

Skills are reusable knowledge packs or action workflows. They are the primary packaging unit for repeatable agent behavior in LocalMind.

**Skill types:**
- **Knowledge skills:** Reference material — API docs, style guides, architecture notes
- **Action skills:** Invocable workflows triggered by slash commands

**Requirements:**
- Skill format: markdown or YAML+markdown
- Slash command invocation (e.g., `/review-pr`, `/qa-regression`, `/debug-flaky-test`)
- Skill visibility: auto-invocable, manual-only, protected
- Skill bundles for teams and marketplace installation
- Import Claude Code skills and adapt to LocalMind skill format

**Launch skills for LocalMind (recommended):**

| Skill | Description |
|---|---|
| `/generate-tests` | Generate unit and integration tests for selected code |
| `/trace-bug` | Trace a bug from error message to root cause across files |
| `/review-diff` | Security + quality review of a staged git diff |
| `/qa-smoke` | Run smoke test suite and report failures with fixes |
| `/salesforce-test-audit` | Audit Salesforce test classes for coverage and quality |
| `/playwright-fix` | Diagnose and fix flaky Playwright tests |
| `/mcp-diagnose` | Debug an MCP server connection or tool schema |
| `/agent-benchmark` | Benchmark a model or agent run on a task set |
| `/deploy-staging` | Deploy current branch to staging environment |
| `/explain-codebase` | Explain unfamiliar repo structure and entry points |

---

### 5. MCP, Custom Tools, and Integrations

MCP is the primary extension pathway for connecting LocalMind to external services — databases, Slack, Jira, Google Drive, browser automation, and custom APIs.

**Requirements:**
- Native MCP client and MCP server registry (local and remote)
- LocalMind custom tool SDK for Python and Node.js tools
- Tool manifests with permissions, schemas, risk levels, and usage examples
- Integration catalog UI with MCP server browser, connector health, and install/uninstall
- Auth vault for API keys, OAuth tokens, and local secret references
- Tool execution logs with latency tracking and failure handling
- Tool schema validator for custom tool development

**Priority integrations for v1:**
- GitHub / GitLab CLI
- Jira / Linear
- Slack notifications
- Google Drive / Docs access
- Browser control (Playwright MCP)
- PostgreSQL / SQLite
- VS Code extension bridge

---

### 6. Plan, Build, Review, and Approval Flow

LocalMind has a clear execution state machine that separates planning from building and gives users full visibility and control before any side effects.

**Execution modes:**

| Mode | Behavior |
|---|---|
| Ask | Discuss without taking action. No tool writes. |
| Plan | Generate a structured task plan. File writes blocked. Read-only tools allowed. |
| Build | Execute the plan. Write tools enabled with approval gates. |
| Review | Show diffs, test results, and reasoning summary before commit. |
| Autonomous Run | Run to goal completion with user-defined approval thresholds. |

**Requirements:**
- Plan-first toggle before any write action (default: on in safe mode)
- Approval checkpoints for file writes, shell commands, network calls, and external side effects
- Undo/redo checkpoints for every changeset
- Execution journal showing reasoning summary, tools used, outputs, diffs, and pending approvals
- `/goal` command equivalent: fire-and-forget with a validator that checks goal completion after every step

---

### 7. Subagents and Agent Teams

LocalMind adopts the Claude Code pattern of isolated subagents and coordinated agent teams, adapted for multi-provider model routing.

**Subagents:** Isolated context workers that research, review, write tests, or debug, then return a summary to the main session without consuming main context.

**Agent teams:** Multiple named agents collaborating over a shared task board with inter-agent messaging.

**Agent roles:**

| Role | Responsibility |
|---|---|
| Planner | Decomposes goals into task graph |
| Explorer | Researches codebase, docs, external sources (read-only) |
| Implementer | Writes and edits code |
| Tester | Generates and runs tests |
| Reviewer | Reviews diffs for security, quality, and standards |
| Security Auditor | Scans for vulnerabilities and risky patterns |
| Docs Writer | Generates and updates documentation |

**Requirements:**
- Subagent spawning from main session with isolated context budget
- Agent teams with shared task graph and message bus
- Model assignment per agent (e.g., Ollama for explorer, Claude for implementer)
- Context budget controls per agent
- Human takeover for any subagent or team member at any point
- Agent team dashboard showing all running, blocked, and completed agents

---

### 8. Scheduling and Background Automation

Scheduled and background automation is a core LocalMind capability, not an add-on. This addresses the agent daemon capability that was identified as a gap in the earlier LocalMind roadmap.

**Trigger types:**

| Trigger | Description |
|---|---|
| Cron | Time-based schedule (e.g., every night at 2 AM) |
| Filesystem | Run when a file or directory changes |
| Webhook | External HTTP event triggers an agent run |
| Git event | PR open, push, CI failure, merge event |
| Calendar/time | Relative time triggers (e.g., 30 min before a meeting) |

**Requirements:**
- Scheduled prompts and jobs running locally (agent daemon) or on cloud infra
- Background agent status dashboard: running, completed, failed, retrying
- Retry policies, cost budgets, and notification hooks per job
- Job history with full run logs and artifact snapshots
- Always-on agent daemon mode for persistent desktop/local node operation
- Equivalent to Claude Code Routines and `/loop` command

---

### 9. Multi-Surface UX (Phased)

LocalMind should reach users across surfaces in three phases rather than attempting all at once.

**Phase 1 — Core surfaces:**
- Desktop app (existing)
- Terminal / CLI
- VS Code extension

**Phase 2 — Extended surfaces:**
- Browser companion extension (debug live web apps)
- Remote control (access desktop session from browser or phone)
- Web-based session viewer

**Phase 3 — Mobile and team surfaces:**
- Mobile notification and approval client
- Slack bot integration
- Team session sharing and replay viewer

**Cross-surface requirements:**
- Shared session state across surfaces
- Visual diff review, task queue, and agent dashboard in desktop/web views
- Tool inspector and approval queue accessible from all active surfaces
- Remote takeover: start on one surface, continue on another

---

### 10. Permissions and Security

LocalMind combines fine-grained openness with strong safety defaults, adapting the best of Claude Code's careful-by-default model with OpenCode's configurable tool access.

**Permission modes:**

| Mode | Description | Use Case |
|---|---|---|
| Safe | All writes and shell commands require approval | New repos, untrusted workspaces |
| Balanced | File writes auto-approved, shell commands ask | Day-to-day development |
| Trusted | All tools auto-approved except protected paths and secrets | Personal projects with known codebase |
| Custom | Per-tool policies configured manually | Enterprise, CI runners, team policies |

**Requirements:**
- Per-tool policy: allow, deny, ask, rate-limit, sandbox
- Protected path rules (e.g., never touch `.env`, `secrets/`)
- Network allowlists for outbound tool calls
- Risk labeling for all tools and actions (low / medium / high / critical)
- Full audit log of approvals, denials, tool calls, and side effects
- Policy templates: local-only, enterprise, CI runner, personal experiment
- Secret file protection with vault integration

---

## Non-Goals (v1)

The following are intentionally out of scope for the first PRD version:

- Messaging channel connectors (WhatsApp, Telegram, Discord) as a first-class feature — these belong in a separate channel integration layer, not the core dev agent platform
- Full marketplace monetization backend
- Enterprise RBAC/SSO depth beyond basic team auth
- Full browser-based IDE replacement
- Fully autonomous cloud execution without policy controls
- Consumer assistant or social bot positioning

---

## Differentiators

LocalMind should not compete as a Claude Code clone or OpenCode fork. It should be genuinely better for its target users in these dimensions:

### Local-first model routing
Ollama, Gemini, and OpenAI-compatible APIs are treated as first-class peers, not add-ons. Model routing is intelligent: cheap/fast models for exploration and search, powerful models for implementation and review. Users control routing rules per task type.

### QA-native agent packs
Out-of-box skills and workflows for test generation, regression diagnosis, Playwright/Selenium automation, flaky test analysis, and CI triage. No other coding agent is built for QA engineers by default.

### Agent evaluation layer
Every agent run can be scored on cost, latency, tool call count, success rate, and regression risk. This gives LocalMind a unique observability layer for agentic workflows that competitors lack.

### MCP-first developer platform
Transparent tool schemas, execution logs, and a custom tool SDK for Python and Node.js. Every tool is inspectable and replaceable. Users build on top, not around, the platform.

### Hybrid human/autonomous mode
LocalMind supports a Cowork-style collaborative mode (human and AI side by side) and an Operator-style autonomous mode (fire-and-forget with approval gates). These are two modes of the same platform, not separate products.

---

## MVP Phase Roadmap

### Phase 1 — Foundation (Target: 6-8 weeks)

**Goal:** LocalMind can open a repo, understand it, execute tasks with core tools, and respect permissions.

- [ ] Project onboarding and repo map generation
- [ ] `LOCALMIND.md` and memory layers (project, session, user-global)
- [ ] Core tool runtime: `read`, `write`, `edit`, `patch`, `grep`, `glob`, `bash`, `webfetch`, `websearch`, `question`
- [ ] Plan / Build / Review execution modes
- [ ] Checkpoint and undo/redo for changesets
- [ ] Basic permission engine with safe and trusted modes
- [ ] Git tools: status, diff, branch, commit, PR draft
- [ ] Desktop app and terminal surface
- [ ] Execution journal and run history

### Phase 2 — Agentic Coding (Target: 8-10 weeks after Phase 1)

**Goal:** LocalMind can handle complex multi-step coding, QA, and integration workflows autonomously.

- [ ] LSP integration (go-to-definition, diagnostics, symbols)
- [ ] Skills system and slash command framework
- [ ] 10 launch skills (see skills table above)
- [ ] MCP client and integration catalog
- [ ] LocalMind custom tool SDK (Python + Node.js)
- [ ] Subagent spawning and context isolation
- [ ] Background jobs and scheduler (cron, webhook, git event triggers)
- [ ] VS Code extension
- [ ] Test runner tool and QA artifact collector
- [ ] Browser automation tool (Playwright MCP)
- [ ] `/goal` autonomous run mode with validator

### Phase 3 — Advanced Orchestration (Target: 10-12 weeks after Phase 2)

**Goal:** LocalMind supports multi-agent coordination, team workflows, evaluation, and extended surfaces.

- [ ] Agent teams with shared task graph and inter-agent messaging
- [ ] Agent role framework (Planner, Explorer, Implementer, Tester, Reviewer, Security Auditor, Docs Writer)
- [ ] Agent evaluation layer (cost, latency, tool count, success rate per run)
- [ ] Skill bundles and marketplace packaging
- [ ] Session sharing and replay
- [ ] Remote control and browser companion extension
- [ ] Model benchmark/eval harness integrated into agent runs
- [ ] Team session and shared workspace support
- [ ] Deeper QA automation packs (Salesforce, Playwright, CI triage)

---

## Functional Requirements Summary

| ID | Requirement |
|---|---|
| FR-01 | Open a repository or workspace and generate a project understanding summary with inferred stack, commands, and code map |
| FR-02 | Maintain persistent project instructions in `LOCALMIND.md` and scoped rules in `.localmind/rules/` |
| FR-03 | Support local and cloud model routing across OpenAI-compatible APIs, Gemini, and Ollama sources |
| FR-04 | Provide built-in tools for file IO, code search, shell execution, web access, LSP operations, and planning |
| FR-05 | Support Plan mode and Build mode with write protection in Plan mode |
| FR-06 | Allow users to define, import, install, and invoke skills via slash commands |
| FR-07 | Connect to MCP servers and user-defined custom tools with schema validation and logs |
| FR-08 | Support subagents with isolated context and agent teams with shared task coordination |
| FR-09 | Enforce per-tool permission policies including safe, trusted, and custom modes |
| FR-10 | Support scheduled and background agent execution with cron, webhook, git, and filesystem triggers |
| FR-11 | Expose a visual session view with tasks, tools, diffs, memories, approvals, and artifacts |
| FR-12 | Support import of `CLAUDE.md` and `AGENTS.md` for repo-local initialization |
| FR-13 | Provide an agent evaluation layer scoring each run on cost, latency, tool count, and success rate |
| FR-14 | Support multi-surface continuity: desktop, terminal, VS Code, and remote browser view |

---

## Non-Functional Requirements

| ID | Requirement |
|---|---|
| NFR-01 | All local tool executions must complete within 5 seconds for file operations; bash execution follows subprocess timeout set by user |
| NFR-02 | Memory indexing for a 50K-file monorepo must complete within 60 seconds on initial scan |
| NFR-03 | MCP tool schema loading must not block the main agent context |
| NFR-04 | Permission policies must be enforced before any tool execution, not after |
| NFR-05 | All agent runs must produce a machine-readable execution log in JSON format |
| NFR-06 | Desktop app must support macOS, Windows, and Linux |
| NFR-07 | LocalMind must work fully offline when Ollama models are configured |
| NFR-08 | No plaintext secret storage — all API keys must reference the vault |

---

## Open Questions

1. Which memory backend should power LocalMind first: simple built-in store, vector-backed store (e.g., ChromaDB, Qdrant), or a hybrid structure with commitments and summaries?
2. Should the agent daemon run as a system service, a background process, or a Docker container for local operation?
3. What approval boundaries should be default for shell execution, browser automation, and file writes in trusted versus sandboxed sessions?
4. Should the skill marketplace be hosted (LocalMind Cloud), federated (GitHub-based), or local-only for v1?
5. How should LocalMind handle model fallback when a configured provider is unavailable or over quota?
6. Should subagent model assignment be manual (user-specified) or automatic (LocalMind routing logic picks cheapest capable model)?

---

## Appendix: Capability Comparison

| Capability | Claude Code | OpenCode | LocalMind Target |
|---|---|---|---|
| Model support | Anthropic only | 75+ providers | OpenAI-compatible + Gemini + Ollama |
| License | Proprietary | MIT open-source | Open-core (planned) |
| Persistent instructions | CLAUDE.md | AGENTS.md | LOCALMIND.md + rules/ |
| Skills / workflows | Yes — Skills + slash | Customizable | Yes — Skills + slash commands |
| MCP support | Yes — native | Yes — native | Yes — native + custom SDK |
| Subagents | Yes | Partial | Yes |
| Agent teams | Yes | No | Yes |
| Scheduling / routines | Yes — Routines | No | Yes — daemon + scheduler |
| Checkpoints / undo | Yes | Manual git | Yes |
| LSP integration | Yes | Yes | Yes |
| QA-native packs | No | No | Yes — launch skill set |
| Agent evaluation | No | No | Yes — built-in scoring |
| Local model support | No | Yes (Ollama) | Yes (Ollama + local APIs) |
| Air-gapped operation | No | Yes | Yes |
| Desktop app | Yes | Yes (Tauri) | Yes (existing) |
| Terminal / CLI | Yes | Yes | Yes |
| VS Code extension | Yes | Yes | Phase 1 |
| Mobile / remote | Yes | Partial | Phase 2-3 |
| Session sharing | Partial | Yes | Phase 3 |
| Custom tool SDK | No | No | Yes — Python + Node.js |

---

*This PRD is a living document. Update version number and status on each revision.*
