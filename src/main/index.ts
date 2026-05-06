import { app, BrowserWindow, globalShortcut, shell, session } from 'electron'
import { join } from 'path'
import { appStore } from './settings/app-store'
import { initDatabase, runMigrations, closeDatabase } from './db/connection'
import { registerIpcHandlers } from './ipc'

let mainWindow: BrowserWindow | null = null

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      if (!mainWindow.isVisible()) mainWindow.show()
      mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
    try {
      await initDatabase()
      runMigrations()
    } catch (err) {
      console.error('DB init failed:', err)
    }
    createWindow()
    session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
      callback(permission === 'media' || permission === 'audioCapture')
    })
    session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
      return permission === 'media' || permission === 'audioCapture'
    })
    registerGlobalShortcut()
  })
}

function createWindow(): void {
  const bounds = appStore.get('windowBounds')

  mainWindow = new BrowserWindow({
    width: bounds?.width ?? 1280,
    height: bounds?.height ?? 800,
    x: bounds?.x,
    y: bounds?.y,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('close', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const [x, y] = mainWindow.getPosition()
      const [width, height] = mainWindow.getSize()
      appStore.set('windowBounds', { x, y, width, height })
      appStore.set('windowMaximized', mainWindow.isMaximized())
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (appStore.get('windowMaximized')) {
    mainWindow.maximize()
  }

  registerIpcHandlers(mainWindow)

  // Load renderer
  if (typeof MAIN_WINDOW_VITE_DEV_SERVER_URL !== 'undefined' && MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerGlobalShortcut(): void {
  const shortcut = appStore.get('globalShortcut') ?? 'CommandOrControl+Shift+Space'

  globalShortcut.register(shortcut, () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    if (!mainWindow.isVisible()) mainWindow.show()
    mainWindow.focus()
  })

  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
    closeDatabase()
  })
}

// Type declarations for electron-vite constants
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string
