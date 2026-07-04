# LocalMind Agent Capabilities

## Cowork Agent
**ID:** `cowork`  
**Icon:** groups  
**Category:** Development

### Description
A collaborative coding partner that helps plan, implement, review, and test changes with project context.

### Key Characteristics
- Works like a pair programmer in user-selected workspace folder
- Has full access to local file system (including absolute paths outside workspace)
- Never refuses to access a path because it's outside a "project directory"
- Prefers concrete actions, concise reasoning, testable results
- Keeps code edits scoped and inspects before changing
- Avoids suggesting cloud services unless specifically requested

### Available Tools

#### Repository Navigation & Discovery
- **local__repo_map** — Generate concise repository map with detected stack, commands, important files, instructions, test entry points
- **local__list_files** — List files inside workspace directory
- **local__glob** — Find workspace files by glob pattern (e.g., src/**/*.ts)

#### Code Reading & Analysis
- **local__read_file** — Read text/PDF/DOCX/PPTX/XLSX files with line range support
- **local__search_files** / **local__grep** — Search text files for query (case-insensitive)

#### File & Document Writing
- **local__write_file** — Create or replace text files
- **local__edit_file** — Replace exact string in file (targeted changes)
- **local__patch_file** — Apply multiple replacements in one file (multi-hunk changes)
- **local__write_spreadsheet** — Create Excel (.xlsx) with 2D data array
- **local__append_spreadsheet** — Append rows to existing Excel sheet
- **local__write_document** — Create Word document (.docx) with structured elements
- **local__append_document** — Append elements to existing Word document

#### File Management
- **local__delete_path** — Delete files or directories (requires explicit approval, supports recursive)

#### Git Integration
- **local__git_status** — Run `git status --short`
- **local__git_diff** — Run `git diff` with optional staged flag and file scope

#### Command Execution
- **local__run_npm_script** — Run npm scripts from package.json
- **local__run_command** — Run local executables with arguments (requires approval, sanitized environment)

#### Desktop Automation
- **local__open_url** — Open http(s) URL in default browser
- **local__launch_app** — Launch GUI applications detached and non-blocking

#### External Integration
- **web__search** — Search the web (requires approval in some permission modes)
- **MCP Tools** — Any tools from connected MCP servers (e.g., Puppeteer, computer-use, GitHub, Firecrawl, etc.)
- **Skills** — LocalMind custom skills (e.g., code generation, document summarization)

---

## Code Agent
**ID:** `code`  
**Icon:** terminal  
**Category:** Coding

### Description
A coding agent for planning, editing, debugging, reviewing, testing, and running project workflows with local tools.

### Key Characteristics
- Similar tool set to Cowork but with stronger emphasis on automation workflows
- Default loop: understand → inspect → edit → verify → summarize
- Uses `local__repo_map` early on unfamiliar repositories
- Prefers `local__edit_file` or `local__patch_file` over full rewrites
- Explains risky write/shell/network/delete actions clearly when approval is requested
- Prioritizes concrete bugs, failing paths, missing tests, exact file references
- Will not delete files without explicit user approval

### Available Tools
**Identical to Cowork** — Same 20+ local workspace tools, MCP integration, skills, and web search.

---

## Personal Assistant Agent
**ID:** `personal-assistant`  
**Icon:** smart_toy  
**Category:** Productivity

### Description
Your primary autonomous personal assistant. Connects to your workspaces, recalls memories, manages files, executes scripts, uses MCP servers, and tracks commitments.

### Exclusive Capabilities
- **Memory recall** — Retrieves semantic memories based on query relevance (local lexical search)
- **Commitment tracking** — Remembers promised follow-up tasks and action items
- **Workspace bootstrap** — Loads identity, rules, and context from `.localmind/` directory files
- **Background memory ingestion** — Automatically extracts user preferences and agent commitments from conversations
- **Full workspace access** — Like Cowork, has access to local file system and all tools

### Available Tools
Same as Cowork and Code (all 20+ local tools, MCP, skills, web search) plus memory/commitment capabilities.

---

## Tool Categories & Permissions

### Read Operations (Low Risk)
- `local__list_files`, `local__glob`, `local__read_file`, `local__search_files`, `local__git_status`
- Usually allowed in all permission modes without approval

### Write Operations (Medium Risk)
- `local__write_file`, `local__edit_file`, `local__patch_file`
- `local__write_spreadsheet`, `local__append_spreadsheet`
- `local__write_document`, `local__append_document`
- Requires approval in Safe/Balanced/Custom modes

### Delete Operations (Critical Risk)
- `local__delete_path`
- Always requires explicit approval before execution

### Shell Operations (High Risk)
- `local__run_npm_script`, `local__run_command`, `local__launch_app`
- Always requires approval before execution (non-interactive, sanitized environment)

### Network Operations (High Risk)
- `local__open_url`, `web__search`
- Requires approval in most permission modes

### Protected Path Operations (Critical Risk)
- Any operation on: `.env*`, `**/secrets/**`, `**/*.pem`, `**/*.key`, `**/.git/**`, `**/.ssh/**`, `**/credentials/**`, `**/auth/**`
- Auto-blocked or requires higher approval when attempted on sensitive paths

---

## Permission Modes

### Safe Mode
- Asks for approval on **all writes, shell, and network operations**
- Best for high-security environments

### Balanced Mode (Default)
- Asks for approval on **shell and network operations only**
- Allows simple file reads/writes after first-time explanation
- Best for typical development workflows

### Trusted Mode
- Allows most operations except **critical actions (delete, protected paths)**
- Best for automated workflows where you trust the agent

### Custom Mode
- Asks for all **non-read operations**
- Best for granular control with explicit rules per tool

---

## Key Differences: Cowork vs Code

| Aspect | Cowork | Code |
|--------|--------|------|
| **Style** | Pair programmer, collaborative | Terminal/CLI-like, workflow automation |
| **Focus** | Planning, review, testing | Planning, editing, debugging, testing, running CI/CD |
| **Workflow** | Clarify → propose → help move forward | Understand → inspect → edit → verify → summarize |
| **File Changes** | General editing, collaborative | Prefers targeted edits over full rewrites |
| **Error Analysis** | Concrete implementations, testing | Concrete bugs, failing tests, exact paths |
| **User Interaction** | More questions/clarification | More action-oriented, assumes clear intent |

---

## Real-World Use Cases

### Cowork
- "Review this pull request and suggest improvements"
- "Help me implement a new feature — let's start with the design"
- "Set up unit tests for this module"
- "Create a migration script for the database"

### Code
- "Fix the failing test in /tests/auth.test.ts"
- "Add TypeScript types to this JavaScript file"
- "Debug why the build is failing"
- "Refactor this function for performance"

### Personal Assistant
- "Open my project management dashboard"
- "Summarize my emails and create a task list"
- "Launch VS Code and open the /src directory"
- "Remember that I prefer camelCase for variable names"

---

## MCP Server Integration

All three agents can use tools from any connected MCP server:

### Official MCP Servers (Included in Catalog)
- **computer-use** — OS-level mouse/keyboard/screenshot control (`uvx computer-control-mcp`)
- **Puppeteer** — Browser automation (`npx @modelcontextprotocol/server-puppeteer`)
- **Chrome DevTools** — Programmatic browser inspection
- **Browserbase** — Cloud browser automation
- **Firecrawl** — Web search, scraping, crawling, extraction
- **GitHub** — Repository, PR, issue management
- **Gmail/Google Workspace** — Email, calendar, docs, sheets
- **filesystem** — Read/write arbitrary files (use with caution)
- **postgres**, **sqlite**, **mysql** — Database access

### Custom MCP Servers
You can create your own via the MCP Servers page in LocalMind.

---

## What You Need to Get Started

1. **Select an agent** — Choose Cowork, Code, or Personal Assistant in the chat UI
2. **Set a workspace** — Pick the folder where the agent operates
3. **(Optional) Connect MCP servers** — For computer use, browser automation, or other integrations
4. **Set permission mode** — Choose Safe, Balanced, Trusted, or Custom based on your needs
5. **Start chatting** — Use natural language; agents call tools automatically when needed
