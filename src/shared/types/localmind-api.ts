// ─── IPC ──────────────────────────────────────────
export interface IPCResponse<T = void> {
  success: boolean
  data?: T
  error?: string
}

// ─── LLM ──────────────────────────────────────────
export type ProviderType = 'ollama' | 'openrouter' | 'google' | 'openai' | 'custom' | 'cloudflare'

export interface CustomProviderConfig {
  id: string
  name: string
  baseUrl: string
  apiFormat?: 'openai' | 'anthropic'
  models: { id: string; name: string; contextWindow?: number }[]
}

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | ContentBlock[]
  toolCallId?: string
  toolCalls?: ToolCall[]
}

export interface ContentBlock {
  type: 'text' | 'image_url'
  text?: string
  imageUrl?: { url: string }
}

export interface ToolCall {
  id: string
  name: string
  arguments: string
}

export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, any>
  }
}

export interface LLMRequest {
  messages: LLMMessage[]
  model: string
  provider: ProviderType
  customProviderId?: string
  agentId?: string
  conversationId?: string
  planningEnabled?: boolean
  workspacePath?: string
  personaId?: string
  personaVariables?: Record<string, string>
  tools?: ToolDefinition[]
  stream: boolean
  signal?: AbortSignal
  temperature?: number
  maxTokens?: number
}

export interface LLMStreamChunk {
  type: 'text' | 'tool_call' | 'tool_result' | 'done' | 'error'
  content?: string
  toolCall?: ToolCall
  usage?: TokenUsage
}

export interface ModelInfo {
  id: string
  name: string
  provider: ProviderType
  customProviderId?: string
  contextWindow: number
  costPer1MTokens?: { input: number; output: number }
  supportsVision: boolean
  supportsToolUse: boolean
}

// ─── Consensus ────────────────────────────────────
export interface ConsensusModelSelection {
  provider: ProviderType
  model: string
  customProviderId?: string
}

export interface ConsensusRequest {
  query: string
  models: ConsensusModelSelection[]
  synthesizer: ConsensusModelSelection
  debateRounds?: number
}

export interface CandidateResponse {
  model: string
  provider: string
  status: 'pending' | 'streaming' | 'done' | 'error'
  text: string
  error?: string
}

// ─── API Interfaces ───────────────────────────────
export interface LLMApi {
  startStream: (req: LLMRequest) => Promise<IPCResponse<{ streamId: string }>>
  cancelStream: (streamId: string) => Promise<void>
  listModels: (provider: string) => Promise<IPCResponse<ModelInfo[]>>
  listProviderCatalog: (provider: string) => Promise<IPCResponse<ModelInfo[]>>
  fetchCustomModels: (data: { baseUrl: string; apiKey?: string; apiFormat?: 'openai' | 'anthropic' }) => Promise<IPCResponse<{ id: string; name: string; contextWindow?: number }[]>>
  refinePrompt: (req: LLMRequest & { prompt: string }) => Promise<IPCResponse<string>>
  transcribe: (data: { audio: number[]; provider: string; customProviderId?: string }) => Promise<IPCResponse<string>>
  consensus: (req: ConsensusRequest) => Promise<IPCResponse<{ streamId: string }>>
  estimateCost: (req: LLMRequest) => Promise<IPCResponse<TokenUsage>>
  onChunk: (streamId: string, cb: (chunk: LLMStreamChunk) => void) => () => void
  onDone: (streamId: string, cb: (usage: TokenUsage) => void) => () => void
  onError: (streamId: string, cb: (err: string) => void) => () => void
  signalReady: (streamId: string) => void
}

export interface DbApi {
  createConversation: (data: any) => Promise<IPCResponse<any>>
  getConversations: () => Promise<IPCResponse<any[]>>
  getMessages: (convId: string) => Promise<IPCResponse<any[]>>
  saveMessage: (msg: any) => Promise<IPCResponse<void>>
  updateMessage: (id: string, content: string) => Promise<IPCResponse<void>>
  updateConversation: (convId: string, data: any) => Promise<IPCResponse<void>>
  deleteMessagesAfter: (convId: string, messageId: string) => Promise<IPCResponse<void>>
  deleteConversation: (convId: string) => Promise<IPCResponse<void>>
  searchConversations: (query: string) => Promise<IPCResponse<any[]>>
  generateTitle: (convId: string) => Promise<IPCResponse<string | null>>
}

export interface McpApi {
  connect: (config: any) => Promise<IPCResponse<void>>
  disconnect: (serverId: string) => Promise<IPCResponse<void>>
  restart: (serverId: string) => Promise<IPCResponse<void>>
  callTool: (serverId: string, toolName: string, args: any) => Promise<IPCResponse<any>>
  listTools: () => Promise<IPCResponse<any[]>>
  listResources: (serverId: string) => Promise<IPCResponse<any[]>>
  readResource: (serverId: string, uri: string) => Promise<IPCResponse<any>>
  serverStatus: () => Promise<IPCResponse<any>>
  listPrompts: (serverId: string) => Promise<IPCResponse<any[]>>
  getPrompt: (serverId: string, promptName: string, args?: any) => Promise<IPCResponse<any>>
  listSaved: () => Promise<IPCResponse<any[]>>
}

export interface SettingsApi {
  get: (key: string) => Promise<IPCResponse<any>>
  set: (key: string, value: any) => Promise<IPCResponse<void>>
  getAll: () => Promise<IPCResponse<Record<string, any>>>
  reset: () => Promise<IPCResponse<void>>
  updateShortcut: (shortcut: string) => Promise<IPCResponse<void>>
}

export interface SecretsApi {
  get: (service: string) => Promise<IPCResponse<string | null>>
  set: (service: string, value: string) => Promise<IPCResponse<void>>
}

export interface SkillApi {
  list: () => Promise<IPCResponse<any[]>>
  activate: (skillId: string, convId: string) => Promise<IPCResponse<void>>
  run: (skillId: string, params: any) => Promise<IPCResponse<any>>
  create: (manifest: any) => Promise<IPCResponse<void>>
  update: (id: string, data: any) => Promise<IPCResponse<void>>
  delete: (id: string) => Promise<IPCResponse<void>>
}

export interface Agent {
  id: string
  name: string
  description: string
  systemPrompt: string
  icon?: string
  category: string
  enabled: boolean
  builtIn?: boolean
  createdAt: number
  updatedAt: number
}

export interface AgentApi {
  list: () => Promise<IPCResponse<Agent[]>>
  create: (data: Omit<Agent, 'id' | 'builtIn' | 'createdAt' | 'updatedAt'>) => Promise<IPCResponse<Agent>>
  update: (id: string, data: Partial<Pick<Agent, 'name' | 'description' | 'systemPrompt' | 'icon' | 'category' | 'enabled'>>) => Promise<IPCResponse<void>>
  delete: (id: string) => Promise<IPCResponse<void>>
  approveTool: (approvalId: string, decision: string) => Promise<IPCResponse<void>>
  onApprovalRequest: (cb: (data: any) => void) => void
  offApprovalRequest: (cb: (data: any) => void) => void
}

export interface ArtifactApi {
  save: (data: any) => Promise<IPCResponse<void>>
  list: (convId: string) => Promise<IPCResponse<any[]>>
  export: (id: string, format: string) => Promise<IPCResponse<string>>
  getVersions: (id: string) => Promise<IPCResponse<any[]>>
}

export interface GitInfo {
  isRepo: boolean
  folderName: string
  branch: string | null
  detached: boolean
  isWorktree: boolean
  additions: number
  deletions: number
  changedFiles: number
  untracked: number
  ahead: number
  behind: number
}

export interface WorkspaceApi {
  create: (data: any) => Promise<IPCResponse<void>>
  list: () => Promise<IPCResponse<any[]>>
  update: (id: string, data: any) => Promise<IPCResponse<void>>
  delete: (id: string) => Promise<IPCResponse<void>>
  setActive: (id: string) => Promise<IPCResponse<void>>
  gitInfo: (rootPath: string) => Promise<IPCResponse<GitInfo>>
}

export interface Persona {
  id: string
  name: string
  systemPrompt: string
  icon?: string
  createdAt: number
  updatedAt: number
}

export interface PersonaApi {
  list: () => Promise<IPCResponse<Persona[]>>
  create: (data: Omit<Persona, 'id' | 'createdAt' | 'updatedAt'>) => Promise<IPCResponse<Persona>>
  update: (id: string, data: Partial<Pick<Persona, 'name' | 'systemPrompt' | 'icon'>>) => Promise<IPCResponse<void>>
  delete: (id: string) => Promise<IPCResponse<void>>
}

export interface RagApi {
  index: (filePath: string) => Promise<IPCResponse<void>>
  query: (text: string, topK?: number) => Promise<IPCResponse<string[]>>
  status: () => Promise<IPCResponse<any>>
  listDocuments: () => Promise<IPCResponse<any[]>>
  removeDocument: (id: string) => Promise<IPCResponse<void>>
  onProgress: (cb: (progress: number) => void) => () => void
}

export interface DataApi {
  exportAll: () => Promise<IPCResponse<string>>
  importAll: (zipPath: string) => Promise<IPCResponse<any>>
  exportConversation: (convId: string, format: 'pdf' | 'md') => Promise<IPCResponse<void>>
}

export interface FileApi {
  getPathForFile: (file: File) => string | null
  selectFolder: () => Promise<IPCResponse<string | null>>
  upload: (fileData: any) => Promise<IPCResponse<any>>
  read: (filePath: string) => Promise<IPCResponse<string>>
  uploadFolder: (dirPath: string, extensions?: string[]) => Promise<IPCResponse<any[]>>
}

export interface UrlApi {
  fetch: (url: string) => Promise<IPCResponse<string>>
}

export interface WebSearchApi {
  search: (query: string) => Promise<IPCResponse<{ success: boolean; results: Array<{ title: string; url: string; snippet: string }>; error?: string }>>
  getProvider: () => Promise<IPCResponse<string | null>>
  setProvider: (provider: string) => Promise<IPCResponse<void>>
  getEnabled: () => Promise<IPCResponse<boolean>>
  setEnabled: (enabled: boolean) => Promise<IPCResponse<void>>
}

export interface ClaudeProxyApi {
  getSettings: () => Promise<IPCResponse<any>>
  saveSettings: (settings: any) => Promise<IPCResponse<any>>
  testModels: (settings: any) => Promise<IPCResponse<any[]>>
  start: () => Promise<IPCResponse<any>>
  stop: () => Promise<IPCResponse<any>>
  status: () => Promise<IPCResponse<any>>
}

export interface MemoryApi {
  list: () => Promise<{ success: boolean; data?: any[]; error?: string }>
  create: (input: { content: string; kind?: string; sourceConversationId?: string }) => Promise<{ success: boolean; data?: any; error?: string }>
  update: (id: string, content: string) => Promise<{ success: boolean; data?: any; error?: string }>
  delete: (id: string) => Promise<{ success: boolean; error?: string }>
  setEnabled: (id: string, enabled: boolean) => Promise<{ success: boolean; data?: any; error?: string }>
  recall: (query: string, opts?: { limit?: number; timeoutMs?: number }) => Promise<{ success: boolean; data?: any[]; error?: string }>
  status: () => Promise<{ success: boolean; data?: { total: number; withEmbedding: number; enabled: number; semanticReady: boolean }; error?: string }>
}

export interface OkfApi {
  import: () => Promise<{ success: boolean; data?: { canceled?: boolean; imported?: number; skipped?: number }; error?: string }>
  export: () => Promise<{ success: boolean; data?: { canceled?: boolean; exported?: number; bundleDir?: string }; error?: string }>
}

export interface BrowserApi {
  testCdp: (opts: { host?: string; port?: number; browserPath?: string }) => Promise<{ success: boolean; data?: { ok: boolean; message: string }; error?: string }>
}

export interface LocalMindAPI {
  llm: LLMApi
  db: DbApi
  mcp: McpApi
  settings: SettingsApi
  secrets: SecretsApi
  skill: SkillApi
  agent: AgentApi
  artifact: ArtifactApi
  workspace: WorkspaceApi
  persona: PersonaApi
  rag: RagApi
  data: DataApi
  file: FileApi
  url: UrlApi
  websearch: WebSearchApi
  claudeProxy: ClaudeProxyApi
  memory: MemoryApi
  okf: OkfApi
  browser: BrowserApi
}

declare global {
  interface Window {
    localmind: LocalMindAPI
  }
}
