import { create } from 'zustand'
import { v4 as uuid } from 'uuid'

export interface Message {
  id: string
  conversationId: string
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  toolCalls?: any[]
  toolResults?: any[]
  modelId?: string
  tokensUsed?: number
  createdAt: number
  isStreaming?: boolean
}

export interface Conversation {
  id: string
  title: string | null
  modelId: string | null
  provider: string | null
  starred: boolean
  createdAt: number
  updatedAt: number
}

interface ChatStore {
  conversations: Conversation[]
  messages: Record<string, Message[]>
  activeConversationId: string | null
  isStreaming: boolean

  loadConversations: () => Promise<void>
  createConversation: (data?: { modelId?: string; provider?: string }) => Promise<string>
  selectConversation: (id: string) => Promise<void>
  addMessage: (msg: Omit<Message, 'id' | 'createdAt'>) => Promise<Message>
  addMessageLocal: (convId: string, msg: Message) => void
  updateStreamingMessage: (convId: string, messageId: string, content: string) => void
  finalizeStreamingMessage: (convId: string, messageId: string) => void
  deleteConversation: (id: string) => Promise<void>
  searchConversations: (query: string) => Promise<void>
  setStreaming: (streaming: boolean) => void
}

export const useChatStore = create<ChatStore>((set, get) => ({
  conversations: [],
  messages: {},
  activeConversationId: null,
  isStreaming: false,

  loadConversations: async () => {
    const res = await window.localmind.db.getConversations()
    if (res.success && res.data) {
      set({ conversations: res.data })
    }
  },

  createConversation: async (data) => {
    const id = uuid()
    const now = Date.now()
    const res = await window.localmind.db.createConversation({
      id,
      modelId: data?.modelId,
      provider: data?.provider,
    })
    if (res.success) {
      const conv: Conversation = {
        id,
        title: null,
        modelId: data?.modelId ?? null,
        provider: data?.provider ?? null,
        starred: false,
        createdAt: now,
        updatedAt: now,
      }
      // Pre-seed the messages bucket so updateStreamingMessage never hits
      // an undefined bucket on the very first message.
      set((s) => ({
        conversations: [conv, ...s.conversations],
        activeConversationId: id,
        messages: { ...s.messages, [id]: [] },
      }))
      console.log('[chatStore] createConversation -- messages bucket seeded', { id })

      // Cleanup: remove any previous empty (0-message) conversation from the
      // store + DB AFTER the new conv is already active.  We do this here
      // instead of in the IPC handler so activeConversationId is never null
      // during the delete -- which previously caused ChatInput to unmount and
      // destroyed the useStreaming hook instance mid-stream.
      const prevEmpty = get().conversations.filter(
        (c) => c.id !== id && (get().messages[c.id]?.length ?? 0) === 0
      )
      for (const empty of prevEmpty) {
        // Fire-and-forget -- we don't await so the new conv is usable immediately
        window.localmind.db.deleteConversation(empty.id).catch(() => {})
        set((s) => ({
          conversations: s.conversations.filter((c) => c.id !== empty.id),
          messages: Object.fromEntries(
            Object.entries(s.messages).filter(([k]) => k !== empty.id)
          ),
        }))
        console.log('[chatStore] createConversation -- pruned empty conv', { id: empty.id })
      }
    }
    return id
  },

  selectConversation: async (id) => {
    set({ activeConversationId: id })
    const { messages } = get()
    if (!messages[id]) {
      const res = await window.localmind.db.getMessages(id)
      if (res.success && res.data) {
        set((s) => ({ messages: { ...s.messages, [id]: res.data } }))
      }
    }
  },

  addMessageLocal: (convId, msg) => {
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
    set((s) => ({
      messages: {
        ...s.messages,
        [msg.conversationId]: [...(s.messages[msg.conversationId] ?? []), message],
      },
    }))
    await window.localmind.db.saveMessage(message)
    return message
  },

  updateStreamingMessage: (convId, messageId, content) => {
    set((s) => {
      const msgs = s.messages[convId]
      if (!msgs) {
        console.warn('[chatStore] updateStreamingMessage -- no bucket for convId', convId)
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

  finalizeStreamingMessage: (convId, messageId) => {
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
    await window.localmind.db.deleteConversation(id)
    set((s) => ({
      conversations: s.conversations.filter((c) => c.id !== id),
      messages: Object.fromEntries(Object.entries(s.messages).filter(([k]) => k !== id)),
      activeConversationId: s.activeConversationId === id ? null : s.activeConversationId,
    }))
  },

  searchConversations: async (query) => {
    const res = await window.localmind.db.searchConversations(query)
    if (res.success && res.data) {
      set({ conversations: res.data })
    }
  },

  setStreaming: (streaming) => set({ isStreaming: streaming }),
}))
