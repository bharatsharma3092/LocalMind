import { create } from 'zustand'

interface RagStore {
  documents: any[]
  isIndexing: boolean
  indexingProgress: number
  loadDocuments: () => Promise<void>
}

export const useRagStore = create<RagStore>((set) => ({
  documents: [],
  isIndexing: false,
  indexingProgress: 0,
  loadDocuments: async () => {
    const res = await window.localmind.rag.listDocuments()
    if (res.success && res.data) {
      set({ documents: res.data })
    }
  },
}))
