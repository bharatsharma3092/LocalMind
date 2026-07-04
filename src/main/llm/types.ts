export type {
  ProviderType,
  TokenUsage,
  LLMMessage,
  ContentBlock,
  ToolCall,
  ToolDefinition,
  LLMRequest,
  LLMStreamChunk,
  ModelInfo,
} from '@shared/types/localmind-api'

export interface LLMProvider {
  complete(request: import('@shared/types/localmind-api').LLMRequest): AsyncIterable<import('@shared/types/localmind-api').LLMStreamChunk>
  listModels(): Promise<import('@shared/types/localmind-api').ModelInfo[]>
  /** Full provider model catalog (unfiltered) for user selection. Falls back to listModels when absent. */
  listCatalog?(): Promise<import('@shared/types/localmind-api').ModelInfo[]>
  validateConfig(): Promise<boolean>
}
