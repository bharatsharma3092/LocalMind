// ─── IPC ──────────────────────────────────────────
export interface IPCResponse<T = void> {
  success: boolean
  data?: T
  error?: string
}

// ─── LLM ──────────────────────────────────────────
export type ProviderType = 'ollama' | 'openrouter' | 'google' | 'openai' | 'custom'

export interface CustomProviderConfig {
  id: string
  name: string
  baseUrl: string
  models: { id: string; name: string }[]
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

// ─── API Interfaces ───────────────────────────────
export interface LLMApi {
  startStream: (req: LLMRequest) => Promise<{ streamId: string }>
  cancelStream: (streamId: string) => Promise<void>
  listModels: (provider: string) => Promise<IPCResponse<ModelInfo[]>>
  estimateCost: (req: LLMRequest) => Promise<IPCResponse<TokenUsage>>
  onChunk: (streamId: string, cb: (chunk: LLMStreamChunk) => void) => () => void
  onDone: (streamId: string, cb: (usage: TokenUsage) => void) => void
  onError: (streamId: string, cb: (err: string) => void) => void
}

export interface DbApi {
  createConversation: (data: any) => Promise<IPCResponse<any>>
  getConversations: () => Promise<IPCResponse<any[]>>
  getMessages: (convId: string) => Promise<IPCResponse<any[]>>
  saveMessage: (msg: any) => Promise<IPCResponse<void>>
  updateMessage: (id: string, content: string) => Promise<IPCResponse<void>>
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

export interface SkillApi {
  list: () => Promise<IPCResponse<any[]>>
  activate: (skillId: string, convId: string) => Promise<IPCResponse<void>>
  run: (skillId: string, params: any) => Promise<IPCResponse<any>>
  create: (manifest: any) => Promise<IPCResponse<void>>
  update: (id: string, data: any) => Promise<IPCResponse<void>>
  delete: (id: string) => Promise<IPCResponse<void>>
}

export interface ArtifactApi {
  save: (data: any) => Promise<IPCResponse<void>>
  list: (convId: string) => Promise<IPCResponse<any[]>>
  export: (id: string, format: string) => Promise<IPCResponse<string>>
  getVersions: (id: string) => Promise<IPCResponse<any[]>>
}

export interface WorkspaceApi {
  create: (data: any) => Promise<IPCResponse<void>>
  list: () => Promise<IPCResponse<any[]>>
  update: (id: string, data: any) => Promise<IPCResponse<void>>
  delete: (id: string) => Promise<IPCResponse<void>>
  setActive: (id: string) => Promise<IPCResponse<void>>
}

export interface PersonaApi {
  list: () => Promise<IPCResponse<any[]>>
  create: (data: any) => Promise<IPCResponse<void>>
  update: (id: string, data: any) => Promise<IPCResponse<void>>
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
  upload: (fileData: any) => Promise<IPCResponse<any>>
  read: (filePath: string) => Promise<IPCResponse<string>>
  uploadFolder: (dirPath: string, extensions?: string[]) => Promise<IPCResponse<any[]>>
}

export interface UrlApi {
  fetch: (url: string) => Promise<IPCResponse<string>>
}

export interface LocalMindAPI {
  llm: LLMApi
  db: DbApi
  mcp: McpApi
  settings: SettingsApi
  skill: SkillApi
  artifact: ArtifactApi
  workspace: WorkspaceApi
  persona: PersonaApi
  rag: RagApi
  data: DataApi
  file: FileApi
  url: UrlApi
}

declare global {
  interface Window {
    localmind: LocalMindAPI
  }
}
