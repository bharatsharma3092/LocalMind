import { create } from 'zustand'
import type { ModelInfo } from './providerStore'

export interface CandidateResponse {
  model: string
  provider: string
  status: 'pending' | 'streaming' | 'done' | 'error'
  text: string
  error?: string
}

export interface DebateRoundResponse {
  round: number
  text: string
  status: 'pending' | 'done' | 'error'
  error?: string
}

export interface DebateRecord {
  model: string
  provider: string
  status: 'pending' | 'streaming' | 'done' | 'error'
  initialText: string
  rounds: DebateRoundResponse[]
  finalText: string
  error?: string
}

export interface ModeratorBrief {
  round: number
  text: string
}

interface ConsensusStore {
  selectedModels: ModelInfo[]
  synthesizerModel: ModelInfo | null
  debateRounds: number
  isRunning: boolean
  candidateResponses: CandidateResponse[]
  debateRecords: DebateRecord[]
  moderatorBriefs: ModeratorBrief[]
  synthesizedAnswer: string
  streamId: string | null
  query: string
  conversationId: string | null

  addModel: (model: ModelInfo) => void
  removeModel: (modelId: string) => void
  setSynthesizer: (model: ModelInfo | null) => void
  setDebateRounds: (rounds: number) => void
  setQuery: (query: string) => void
  setRunning: (running: boolean) => void
  setCandidates: (candidates: CandidateResponse[]) => void
  setDebateState: (state: { records?: DebateRecord[]; moderatorBriefs?: ModeratorBrief[] }) => void
  appendSynthesis: (text: string) => void
  setStreamId: (id: string | null) => void
  setConversationId: (id: string | null) => void
  reset: () => void
}

export const useConsensusStore = create<ConsensusStore>((set) => ({
  selectedModels: [],
  synthesizerModel: null,
  debateRounds: 2,
  isRunning: false,
  candidateResponses: [],
  debateRecords: [],
  moderatorBriefs: [],
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

  setDebateRounds: (rounds) => {
    const requestedRounds = Number(rounds)
    set({ debateRounds: Number.isFinite(requestedRounds) ? Math.max(1, Math.min(3, Math.round(requestedRounds))) : 2 })
  },

  setQuery: (query) => set({ query }),

  setRunning: (running) => set({ isRunning: running }),

  setCandidates: (candidates) => set({ candidateResponses: candidates }),

  setDebateState: (state) =>
    set((s) => ({
      debateRecords: state.records ?? s.debateRecords,
      moderatorBriefs: state.moderatorBriefs ?? s.moderatorBriefs,
    })),

  appendSynthesis: (text) =>
    set((s) => ({ synthesizedAnswer: s.synthesizedAnswer + text })),

  setStreamId: (id) => set({ streamId: id }),

  setConversationId: (id) => set({ conversationId: id }),

  reset: () =>
    set({
      isRunning: false,
      candidateResponses: [],
      debateRecords: [],
      moderatorBriefs: [],
      synthesizedAnswer: '',
      streamId: null,
      conversationId: null,
    }),
}))
