import { create } from 'zustand'
import { v4 as uuid } from 'uuid'

// ---------------------------------------------------------------------------
// Lightweight tagged logger -- every line is grep-able by [chatStore] prefix
// ---------------------------------------------------------------------------
const log = {
  info:  (fn: string, msg: string, data?: unknown) =>
    console.log(`[chatStore][${fn}] ${msg}`, data !== undefined ? data : ''),
  warn:  (fn: string, msg: string, data?: unknown) =>
    console.warn(`[chatStore][${fn}] [WARN] ${msg}`, data !== undefined ? data : ''),
  error: (fn: string, msg: string, data?: unknown) =>
    console.error(`[chatStore][${fn}] [ERROR] ${msg}`, data !== undefined ? data : ''),
}

export interface Message {
  id: string
  conversationId: string
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  toolCallId?: string
  toolCalls?: any[]
  toolResults?: any[]
  modelId?: string
  tokensUsed?: number
  createdAt: number
  isStreaming?: boolean
}

export interface Conversation {
  id: string
  personaId: string | null
  title: string | null
  modelId: string | null
  provider: string | null
  starred: boolean
  parentConversationId?: string | null
  createdAt: number
  updatedAt: number
}

interface ChatStore {
  conversations: Conversation[]
  messages: Record<string, Message[]>
  activeConversationId: string | null
  isStreaming: boolean

  loadConversations: () => Promise<void>
  createConversation: (data?: { modelId?: string; provider?: string; personaId?: string | null }) => Promise<string>
  selectConversation: (id: string) => Promise<void>
  addMessage: (msg: Omit<Message, 'id' | 'createdAt'>) => Promise<Message>
  addMessageLocal: (convId: string, msg: Message) => void
  updateStreamingMessage: (convId: string, messageId: string, content: string) => void
  addToolCallToStreamingMessage: (convId: string, messageId: string, toolCall: any) => void
  addToolResultMessage: (convId: string, msg: Message) => Promise<void>
  finalizeStreamingMessage: (convId: string, messageId: string) => void
  deleteConversation: (id: string) => Promise<void>
  searchConversations: (query: string) => Promise<void>
  clearActiveConversation: () => void
  setStreaming: (streaming: boolean) => void
  updateConversationTitle: (convId: string, title: string) => void
  updateConversationPersona: (convId: string, personaId: string | null) => Promise<void>
  toggleStarred: (convId: string) => Promise<void>
}

export const useChatStore = create<ChatStore>((set, get) => ({
  conversations: [],
  messages: {},
  activeConversationId: null,
  isStreaming: false,

  loadConversations: async () => {
    log.info('loadConversations', 'Fetching conversations from DB')
    const res = await window.localmind.db.getConversations()
    if (res.success && res.data) {
      const primaryConvs = res.data.filter((c: any) => !c.parentConversationId)
      log.info('loadConversations', 'Conversations loaded', { count: primaryConvs.length, ids: primaryConvs.map((c: Conversation) => c.id) })
      set({ conversations: primaryConvs })

      for (const conv of primaryConvs) {
        if (!conv.title) {
          window.localmind.db.generateTitle(conv.id).then((titleRes) => {
            if (titleRes.success && titleRes.data) {
              useChatStore.getState().updateConversationTitle(conv.id, titleRes.data!)
            }
          }).catch(() => {})
        }
      }
    } else {
      log.error('loadConversations', 'Failed to load conversations', res)
    }
  },

  createConversation: async (data) => {
    const id = uuid()
    const now = Date.now()
    log.info('createConversation', 'Creating new conversation', { id, modelId: data?.modelId, provider: data?.provider })

    const res = await window.localmind.db.createConversation({
      id,
      modelId: data?.modelId,
      provider: data?.provider,
      personaId: data?.personaId ?? null,
    })

    if (!res.success) {
      log.error('createConversation', 'DB createConversation failed', res)
      return id
    }

    const conv: Conversation = {
      id,
      personaId: data?.personaId ?? null,
      title: null,
      modelId: data?.modelId ?? null,
      provider: data?.provider ?? null,
      starred: false,
      createdAt: now,
      updatedAt: now,
    }

    // Seed the bucket BEFORE any prune logic so activeConversationId is
    // never pointing at a conversation without a messages bucket.
    set((s) => ({
      conversations: [conv, ...s.conversations],
      activeConversationId: id,
      messages: { ...s.messages, [id]: [] },
    }))
    log.info('createConversation', 'New conv added to store & messages bucket seeded', { id })

    // Prune: only delete conversations whose bucket is LOADED (not undefined)
    // and confirmed empty.  undefined bucket = messages never fetched from DB
    // = we cannot safely assume they have no messages.
    const state = get()
    const allConvs = state.conversations
    const allBuckets = state.messages

    log.info('createConversation', 'Evaluating candidates for empty-conv pruning', {
      totalConvsInStore: allConvs.length,
      loadedBuckets: Object.keys(allBuckets).length,
    })

    const prevEmpty = allConvs.filter((c) => {
      if (c.id === id) return false                       // skip the new one
      const bucket = allBuckets[c.id]
      const bucketLoaded = bucket !== undefined
      const bucketEmpty  = bucketLoaded && bucket.length === 0
      log.info(
        'createConversation',
        `  conv ${c.id}: bucketLoaded=${bucketLoaded}, bucketLength=${bucket?.length ?? 'n/a'}, willPrune=${bucketEmpty}`,
      )
      return bucketEmpty
    })

    if (prevEmpty.length === 0) {
      log.info('createConversation', 'No empty conversations to prune')
    }

    for (const empty of prevEmpty) {
      log.warn('createConversation', 'Pruning confirmed-empty conversation', { id: empty.id })
      window.localmind.db.deleteConversation(empty.id).catch((err: unknown) => {
        log.error('createConversation', 'DB delete failed for pruned conv', { id: empty.id, err })
      })
      set((s) => ({
        conversations: s.conversations.filter((c) => c.id !== empty.id),
        messages: Object.fromEntries(
          Object.entries(s.messages).filter(([k]) => k !== empty.id)
        ),
      }))
      log.info('createConversation', 'Pruned empty conv removed from store', { id: empty.id })
    }

    return id
  },

  selectConversation: async (id) => {
    log.info('selectConversation', 'Selecting conversation', { id })
    set({ activeConversationId: id })
    const { messages } = get()
    if (!messages[id]) {
      log.info('selectConversation', 'No bucket in memory -- fetching messages from DB', { id })
      const res = await window.localmind.db.getMessages(id)
      if (res.success && res.data) {
        const parsedMessages = res.data.map((m: any) => ({
          ...m,
          toolCalls: typeof m.toolCalls === 'string' ? JSON.parse(m.toolCalls) : (m.toolCalls || []),
          toolResults: typeof m.toolResults === 'string' ? JSON.parse(m.toolResults) : (m.toolResults || []),
        }))
        log.info('selectConversation', 'Messages loaded from DB', { id, count: parsedMessages.length })
        set((s) => ({ messages: { ...s.messages, [id]: parsedMessages } }))
      } else {
        log.error('selectConversation', 'Failed to load messages from DB', { id, res })
      }
    } else {
      log.info('selectConversation', 'Bucket already in memory -- skipping DB fetch', { id, count: messages[id].length })
    }
  },

  addMessageLocal: (convId, msg) => {
    log.info('addMessageLocal', 'Adding message to local store only', { convId, messageId: msg.id, role: msg.role })
    set((s) => ({
      messages: {
        ...s.messages,
        [convId]: [...(s.messages[convId] ?? []), msg],
      },
    }))
  },

  addMessage: async (msg) => {
    const message: Message = {
      ...msg,
      id: uuid(),
      createdAt: Date.now(),
    }
    log.info('addMessage', 'Saving message to store + DB', { id: message.id, role: message.role, convId: msg.conversationId })
    set((s) => ({
      messages: {
        ...s.messages,
        [msg.conversationId]: [...(s.messages[msg.conversationId] ?? []), message],
      },
    }))
    await window.localmind.db.saveMessage(message)
    log.info('addMessage', 'Message persisted', { id: message.id })

    // Auto-update conversation title from first user message
    if (msg.role === 'user') {
      const state = get()
      const conv = state.conversations.find((c) => c.id === msg.conversationId)
      if (conv && !conv.title) {
        const title = msg.content.replace(/\n/g, ' ').trim().slice(0, 60)
        if (title) {
          log.info('addMessage', 'Auto-setting conversation title from first user message', { convId: msg.conversationId, title })
          get().updateConversationTitle(msg.conversationId, title)
          window.localmind.db.updateConversation(msg.conversationId, { title }).catch(() => {})
        }
      }
    }

    return message
  },

  updateStreamingMessage: (convId, messageId, content) => {
    set((s) => {
      const msgs = s.messages[convId]
      if (!msgs) {
        log.warn('updateStreamingMessage', 'No bucket found for convId -- chunk dropped', { convId, messageId })
        return s
      }
      return {
        messages: {
          ...s.messages,
          [convId]: msgs.map((m) =>
            m.id === messageId ? { ...m, content: m.content + content } : m
          ),
        },
      }
    })
  },

  addToolCallToStreamingMessage: (convId, messageId, toolCall) => {
    log.info('addToolCallToStreamingMessage', 'Adding tool call to streaming message', { convId, messageId, toolCall })
    set((s) => {
      const msgs = s.messages[convId] ?? []
      return {
        messages: {
          ...s.messages,
          [convId]: msgs.map((m) => {
            if (m.id === messageId) {
              const toolCalls = m.toolCalls ? [...m.toolCalls] : []
              if (!toolCalls.some((tc) => tc.id === toolCall.id)) {
                toolCalls.push(toolCall)
              }
              return { ...m, toolCalls }
            }
            return m
          }),
        },
      }
    })
  },

  addToolResultMessage: async (convId, msg) => {
    log.info('addToolResultMessage', 'Adding tool result message to store + DB', { convId, msgId: msg.id })
    set((s) => ({
      messages: {
        ...s.messages,
        [convId]: [...(s.messages[convId] ?? []), msg],
      },
    }))
    await window.localmind.db.saveMessage(msg)
    log.info('addToolResultMessage', 'Tool result message persisted', { id: msg.id })
  },

  finalizeStreamingMessage: (convId, messageId) => {
    log.info('finalizeStreamingMessage', 'Finalizing streaming message', { convId, messageId })
    set((s) => {
      const msgs = s.messages[convId] ?? []
      return {
        messages: {
          ...s.messages,
          [convId]: msgs.map((m) =>
            m.id === messageId ? { ...m, isStreaming: false } : m
          ),
        },
      }
    })
  },

  deleteConversation: async (id) => {
    log.warn('deleteConversation', 'Deleting conversation (user-initiated)', { id })
    await window.localmind.db.deleteConversation(id)
    set((s) => ({
      conversations: s.conversations.filter((c) => c.id !== id),
      messages: Object.fromEntries(Object.entries(s.messages).filter(([k]) => k !== id)),
      activeConversationId: s.activeConversationId === id ? null : s.activeConversationId,
    }))
    log.info('deleteConversation', 'Conversation removed from store', { id })
  },

  // -------------------------------------------------------------------------
  searchConversations: async (query) => {
    log.info('searchConversations', 'Searching conversations', { query })
    const res = await window.localmind.db.searchConversations(query)
    if (res.success && res.data) {
      log.info('searchConversations', 'Search results loaded', { count: res.data.length })
      set({ conversations: res.data })
    } else {
      log.error('searchConversations', 'Search failed', res)
    }
  },

  clearActiveConversation: () => {
    log.info('clearActiveConversation', 'Returning to chat home')
    set({ activeConversationId: null })
  },

  // -------------------------------------------------------------------------
  setStreaming: (streaming) => {
    log.info('setStreaming', `Streaming state -> ${streaming}`)
    set({ isStreaming: streaming })
  },

  // -------------------------------------------------------------------------
  updateConversationTitle: (convId, title) => {
    log.info('updateConversationTitle', 'Updating title', { convId, title })
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === convId ? { ...c, title } : c
      ),
    }))
  },

  updateConversationPersona: async (convId, personaId) => {
    log.info('updateConversationPersona', 'Updating conversation persona', { convId, personaId })
    await window.localmind.db.updateConversation(convId, { personaId })
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === convId ? { ...c, personaId } : c
      ),
    }))
  },

  toggleStarred: async (convId) => {
    const conv = get().conversations.find((c) => c.id === convId)
    if (!conv) return
    const newStarred = !conv.starred
    await window.localmind.db.updateConversation(convId, { starred: newStarred })
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === convId ? { ...c, starred: newStarred } : c
      ),
    }))
  },
}))
