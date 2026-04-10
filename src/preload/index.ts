import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('localmind', {
  // LLM
  llm: {
    startStream: (req: any) => ipcRenderer.invoke('llm:startStream', req),
    cancelStream: (streamId: string) => ipcRenderer.invoke('llm:cancelStream', streamId),
    listModels: (provider: string) => ipcRenderer.invoke('llm:listModels', provider),
    estimateCost: (req: any) => ipcRenderer.invoke('llm:estimateCost', req),

    // FIX: renderer calls this after all onChunk/onDone/onError listeners are
    // attached. Main process holds buffered chunks until this signal arrives,
    // preventing the race condition where slow model cold-load (e.g. gemma4:e4b
    // ~34s startup) causes chunks to be sent before listeners are registered.
    signalReady: (streamId: string) => ipcRenderer.send(`llm:ready:${streamId}`, streamId),

    onChunk: (streamId: string, cb: (chunk: any) => void) => {
      const channel = `llm:chunk:${streamId}`
      const handler = (_: any, chunk: any) => cb(chunk)
      ipcRenderer.on(channel, handler)
      return () => ipcRenderer.removeListener(channel, handler)
    },
    onDone: (streamId: string, cb: (usage: any) => void) => {
      const channel = `llm:done:${streamId}`
      ipcRenderer.once(channel, (_: any, usage: any) => cb(usage))
    },
    onError: (streamId: string, cb: (err: string) => void) => {
      const channel = `llm:error:${streamId}`
      ipcRenderer.once(channel, (_: any, err: string) => cb(err))
    },
  },

  // DB
  db: {
    createConversation: (data: any) => ipcRenderer.invoke('db:createConversation', data),
    getConversations: () => ipcRenderer.invoke('db:getConversations'),
    getMessages: (convId: string) => ipcRenderer.invoke('db:getMessages', convId),
    saveMessage: (msg: any) => ipcRenderer.invoke('db:saveMessage', msg),
    updateMessage: (id: string, content: string) => ipcRenderer.invoke('db:updateMessage', id, content),
    deleteMessagesAfter: (convId: string, messageId: string) => ipcRenderer.invoke('db:deleteMessagesAfter', convId, messageId),
    deleteConversation: (convId: string) => ipcRenderer.invoke('db:deleteConversation', convId),
    searchConversations: (query: string) => ipcRenderer.invoke('db:searchConversations', query),
    generateTitle: (convId: string) => ipcRenderer.invoke('db:generateTitle', convId),
  },

  // Settings
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: any) => ipcRenderer.invoke('settings:set', key, value),
    getAll: () => ipcRenderer.invoke('settings:getAll'),
    reset: () => ipcRenderer.invoke('settings:reset'),
    updateShortcut: (shortcut: string) => ipcRenderer.invoke('settings:updateShortcut', shortcut),
  },

  // MCP
  mcp: {
    connect: (config: any) => ipcRenderer.invoke('mcp:connect', config),
    disconnect: (serverId: string) => ipcRenderer.invoke('mcp:disconnect', serverId),
    restart: (serverId: string) => ipcRenderer.invoke('mcp:restart', serverId),
    callTool: (serverId: string, toolName: string, args: any) => ipcRenderer.invoke('mcp:callTool', serverId, toolName, args),
    listTools: () => ipcRenderer.invoke('mcp:listTools'),
    listResources: (serverId: string) => ipcRenderer.invoke('mcp:listResources', serverId),
    readResource: (serverId: string, uri: string) => ipcRenderer.invoke('mcp:readResource', serverId, uri),
    serverStatus: () => ipcRenderer.invoke('mcp:serverStatus'),
    listPrompts: (serverId: string) => ipcRenderer.invoke('mcp:listPrompts', serverId),
    getPrompt: (serverId: string, promptName: string, args?: any) => ipcRenderer.invoke('mcp:getPrompt', serverId, promptName, args),
  },

  // Skills
  skill: {
    list: () => ipcRenderer.invoke('skill:list'),
    activate: (skillId: string, convId: string) => ipcRenderer.invoke('skill:activate', skillId, convId),
    run: (skillId: string, params: any) => ipcRenderer.invoke('skill:run', skillId, params),
    create: (manifest: any) => ipcRenderer.invoke('skill:create', manifest),
    update: (id: string, data: any) => ipcRenderer.invoke('skill:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('skill:delete', id),
  },

  // Artifacts
  artifact: {
    save: (data: any) => ipcRenderer.invoke('artifact:save', data),
    list: (convId: string) => ipcRenderer.invoke('artifact:list', convId),
    export: (id: string, format: string) => ipcRenderer.invoke('artifact:export', id, format),
    getVersions: (id: string) => ipcRenderer.invoke('artifact:getVersions', id),
  },

  // Workspaces
  workspace: {
    create: (data: any) => ipcRenderer.invoke('workspace:create', data),
    list: () => ipcRenderer.invoke('workspace:list'),
    update: (id: string, data: any) => ipcRenderer.invoke('workspace:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('workspace:delete', id),
    setActive: (id: string) => ipcRenderer.invoke('workspace:setActive', id),
  },

  // Personas
  persona: {
    list: () => ipcRenderer.invoke('persona:list'),
    create: (data: any) => ipcRenderer.invoke('persona:create', data),
    update: (id: string, data: any) => ipcRenderer.invoke('persona:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('persona:delete', id),
  },

  // RAG
  rag: {
    index: (filePath: string) => ipcRenderer.invoke('rag:index', filePath),
    query: (text: string, topK?: number) => ipcRenderer.invoke('rag:query', text, topK),
    status: () => ipcRenderer.invoke('rag:status'),
    listDocuments: () => ipcRenderer.invoke('rag:listDocuments'),
    removeDocument: (id: string) => ipcRenderer.invoke('rag:removeDocument', id),
    onProgress: (cb: (progress: any) => void) => {
      const handler = (_: any, data: any) => cb(data)
      ipcRenderer.on('rag:progress', handler)
      return () => ipcRenderer.removeListener('rag:progress', handler)
    },
  },

  // Data
  data: {
    exportAll: () => ipcRenderer.invoke('data:exportAll'),
    importAll: (zipPath: string) => ipcRenderer.invoke('data:importAll', zipPath),
    exportConversation: (convId: string, format: 'pdf' | 'md') => ipcRenderer.invoke('data:exportConversation', convId, format),
  },

  // File
  file: {
    upload: (fileData: any) => ipcRenderer.invoke('file:upload', fileData),
    read: (filePath: string) => ipcRenderer.invoke('file:read', filePath),
    uploadFolder: (dirPath: string, extensions?: string[]) => ipcRenderer.invoke('file:uploadFolder', dirPath, extensions),
  },

  // URL
  url: {
    fetch: (url: string) => ipcRenderer.invoke('url:fetch', url),
  },

  // Secrets
  secrets: {
    get: (service: string) => ipcRenderer.invoke('secrets:get', service),
    set: (service: string, value: string) => ipcRenderer.invoke('secrets:set', service, value),
  },
})
