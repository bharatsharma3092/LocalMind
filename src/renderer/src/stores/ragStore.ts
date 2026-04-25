import { create } from 'zustand'

interface RagDocument {
  id: string
  filename: string
  chunkCount: number
  createdAt: number
}

interface RagStatus {
  documentCount: number
  chunkCount: number
  isReady: boolean
}

interface RagStore {
  documents: RagDocument[]
  status: RagStatus | null
  isIndexing: boolean
  indexingProgress: number
  loadDocuments: () => Promise<void>
  loadStatus: () => Promise<void>
  indexDocument: (filePath: string) => Promise<void>
  removeDocument: (id: string) => Promise<void>
  setIndexingProgress: (pct: number) => void
}

export const useRagStore = create<RagStore>((set, get) => ({
  documents: [],
  status: null,
  isIndexing: false,
  indexingProgress: 0,

  loadDocuments: async () => {
    const res = await window.localmind.rag.listDocuments()
    if (res.success && res.data) {
      set({ documents: res.data })
    }
  },

  loadStatus: async () => {
    const res = await window.localmind.rag.status()
    if (res.success && res.data) {
      set({ status: res.data })
    }
  },

  indexDocument: async (filePath: string) => {
    set({ isIndexing: true, indexingProgress: 0 })
    try {
      await window.localmind.rag.index(filePath)
      await get().loadDocuments()
      await get().loadStatus()
    } finally {
      set({ isIndexing: false, indexingProgress: 100 })
    }
  },

  removeDocument: async (id: string) => {
    await window.localmind.rag.removeDocument(id)
    await get().loadDocuments()
    await get().loadStatus()
  },

  setIndexingProgress: (pct: number) => {
    set({ indexingProgress: pct })
  },
}))
