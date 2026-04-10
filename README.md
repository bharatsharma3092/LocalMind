                                                                                                        
                                                                                            Open a terminal in the project directory and run:                                
                                                                                                                      
  cd "D:\My Code\LocalMind"                                                        
  npm run dev

  This starts the Electron app with hot-reload dev server. You'll see:
  - A desktop window with the LocalMind UI
  - Sidebar with "New Conversation" button and search
  - Chat area with "Start New Conversation" prompt
  - Settings gear icon in the top bar

  What You Can Validate

  1. Window behavior — Resize/move the window, close it, relaunch. Window position restores from saved state.
  2. Single-instance lock — Try launching a second copy. It should focus the first window instead.
  3. Create conversation — Click "New Conversation" or "Start New Conversation". A new chat appears in the sidebar.
  4. Sidebar search — Type in the search box. Debounced at 300ms (check network tab — no per-keystroke calls).
  5. Settings — Click the gear icon. You'll see Theme (system/light/dark), Privacy Mode toggle, Ollama URL, and API
  key fields.
  6. Ollama models — If you have Ollama running locally (ollama serve + a model pulled), click the model selector
  dropdown. Models appear grouped by provider with green status dots.
  7. Send a message — Select a model, type a message, press Enter. The app calls Ollama's /api/chat with streaming.
  Tokens appear in real-time. After the first response, the conversation gets an auto-generated title.
  8. Token counter — The context bar shows token usage with a green/amber/red progress bar.
  9. Message actions — Hover over any message to see Copy/Edit (user) and Regenerate (assistant) buttons.
  10. Dark/light theme — Toggle in settings. CSS custom properties switch instantly.
  11. Global shortcut — Press Ctrl+Shift+Space to bring the app to focus from anywhere.
  12. Toast notifications — Error states (e.g., no Ollama running) show colored toast notifications in the
  bottom-right.

  To test Ollama specifically, make sure you have it running:
  ollama serve