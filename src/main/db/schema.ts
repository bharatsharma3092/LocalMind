import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  systemPrompt: text('system_prompt'),
  defaultModel: text('default_model'),
  mcpConfig: text('mcp_config'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').references(() => workspaces.id),
  personaId: text('persona_id'),
  title: text('title'),
  modelId: text('model_id'),
  provider: text('provider'),
  tokenUsage: text('token_usage'),
  starred: integer('starred', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').references(() => conversations.id).notNull(),
  role: text('role').notNull(),
  content: text('content').notNull(),
  toolCalls: text('tool_calls'),
  toolResults: text('tool_results'),
  modelId: text('model_id'),
  tokensUsed: integer('tokens_used'),
  parentMessageId: text('parent_message_id'),
  branchId: text('branch_id'),
  createdAt: integer('created_at').notNull(),
})

export const artifacts = sqliteTable('artifacts', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').references(() => conversations.id),
  messageId: text('message_id').references(() => messages.id),
  type: text('type').notNull(),
  content: text('content').notNull(),
  version: integer('version').default(1),
  createdAt: integer('created_at').notNull(),
})

export const mcpServers = sqliteTable('mcp_servers', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').references(() => workspaces.id),
  name: text('name').notNull(),
  config: text('config').notNull(),
  permissions: text('permissions'),
  enabled: integer('enabled', { mode: 'boolean' }).default(true),
})

export const skills = sqliteTable('skills', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  manifest: text('manifest').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).default(true),
  installedAt: integer('installed_at').notNull(),
})

export const agents = sqliteTable('agents', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  systemPrompt: text('system_prompt').notNull(),
  icon: text('icon'),
  category: text('category').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).default(true),
  builtIn: integer('built_in', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const personas = sqliteTable('personas', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  systemPrompt: text('system_prompt').notNull(),
  icon: text('icon'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const providerConfigs = sqliteTable('provider_configs', {
  id: text('id').primaryKey(),
  providerType: text('provider_type').notNull(),
  configJson: text('config_json').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).default(true),
})

export const modelProfiles = sqliteTable('model_profiles', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  provider: text('provider').notNull(),
  modelId: text('model_id').notNull(),
  temperature: real('temperature').default(0.7),
  maxTokens: integer('max_tokens').default(4096),
  isDefault: integer('is_default', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at').notNull(),
})

export const pinnedFiles = sqliteTable('pinned_files', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').references(() => conversations.id),
  filename: text('filename').notNull(),
  contentText: text('content_text').notNull(),
  createdAt: integer('created_at').notNull(),
})

export const skillPipelines = sqliteTable('skill_pipelines', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  steps: text('steps').notNull(),
  createdAt: integer('created_at').notNull(),
})
