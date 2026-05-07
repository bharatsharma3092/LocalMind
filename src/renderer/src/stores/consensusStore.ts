import { create } from 'zustand'
import type { ModelInfo } from './providerStore'

export interface CandidateResponse {
  model: string
  provider: string
  status: 'pending' | 'streaming' | 'done' | 'error'
  text: string
  error?: string
}

interface ConsensusStore {
  selectedModels: ModelInfo[]
  synthesizerModel: ModelInfo | null
  isRunning: boolean
  candidateResponses: CandidateResponse[]
  synthesizedAnswer: string
  streamId: string | null
  query: string
  conversationId: string | null

  addModel: (model: ModelInfo) => void
  removeModel: (modelId: string) => void
  setSynthesizer: (model: ModelInfo | null) => void
  setQuery: (query: string) => void
  setRunning: (running: boolean) => void
  setCandidates: (candidates: CandidateResponse[]) => void
  appendSynthesis: (text: string) => void
  setStreamId: (id: string | null) => void
  setConversationId: (id: string | null) => void
  reset: () => void
}

export const useConsensusStore = create<ConsensusStore>((set) => ({
  selectedModels: [],
  synthesizerModel: null,
  isRunning: false,
  candidateResponses: [],
  synthesizedAnswer: '',
  streamId: null,
  query: '',
  conversationId: null,

  addModel: (model) =>
    set((s) => {
      if (s.selectedModels.length >= 5) return s
      if (s.selectedModels.some((m) => m.id === model.id && m.provider === model.provider)) return s
      return { selectedModels: [...s.selectedModels, model] }
    }),

  removeModel: (modelId) =>
    set((s) => ({
      selectedModels: s.selectedModels.filter((m) => m.id !== modelId),
    })),

  setSynthesizer: (model) => set({ synthesizerModel: model }),

  setQuery: (query) => set({ query }),

  setRunning: (running) => set({ isRunning: running }),

  setCandidates: (candidates) => set({ candidateResponses: candidates }),

  appendSynthesis: (text) =>
    set((s) => ({ synthesizedAnswer: s.synthesizedAnswer + text })),

  setStreamId: (id) => set({ streamId: id }),

  setConversationId: (id) => set({ conversationId: id }),

  reset: () =>
    set({
      isRunning: false,
      candidateResponses: [],
      synthesizedAnswer: '',
      streamId: null,
      conversationId: null,
    }),
}))
