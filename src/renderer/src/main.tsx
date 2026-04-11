import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/globals.css'

// React.StrictMode intentionally mounts every component TWICE in development.
// This causes double IPC calls (listModels fires twice), and more critically
// it tears down + remounts useStreaming listeners mid-stream, causing the
// renderer to miss chunks and render a blank reply.
// Removed for LocalMind since all IPC bridge calls are side-effectful.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <App />
)
