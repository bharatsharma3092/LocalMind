import { app, BrowserWindow, globalShortcut, shell, session } from 'electron'
import { join } from 'path'
import { appStore } from './settings/app-store'
import { initDatabase, runMigrations, closeDatabase } from './db/connection'
import { registerIpcHandlers } from './ipc'
import { memoryService } from './memory/memory-service'

let mainWindow: BrowserWindow | null = null

const gotTheLock = app.requestSingleInstanceLock()

function getAppIconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'resources', 'icon.png')
    : join(app.getAppPath(), 'resources', 'icon.png')
}

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

    // Phase 1 — init memory service BEFORE creating the window so migration
    // completes and IPC handlers have real data when the renderer first loads.
    try {
      await memoryService.init()
    } catch (err) {
      console.error('[MemoryService] Init failed (continuing):', err)
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
  const rendererUrl = process.env.ELECTRON_RENDERER_URL

  mainWindow = new BrowserWindow({
    width: bounds?.width ?? 1280,
    height: bounds?.height ?? 800,
    x: bounds?.x,
    y: bounds?.y,
    show: false,
    icon: getAppIconPath(),
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

  const isAppNavigation = (url: string) => {
    if (rendererUrl && url.startsWith(rendererUrl)) return true
    if (url.startsWith('file://')) return true
    if (url === 'about:blank') return true
    return false
  }

  const openOutsideApp = (url: string) => {
    if (/^(https?:|mailto:|tel:)/i.test(url)) {
      shell.openExternal(url).catch((err) => {
        console.error('Failed to open external URL:', err)
      })
    }
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!isAppNavigation(url)) openOutsideApp(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isAppNavigation(url)) return
    event.preventDefault()
    openOutsideApp(url)
  })

  mainWindow.webContents.on('will-redirect', (event, url) => {
    if (isAppNavigation(url)) return
    event.preventDefault()
    openOutsideApp(url)
  })

  if (appStore.get('windowMaximized')) {
    mainWindow.maximize()
  }

  registerIpcHandlers(mainWindow)

  // Load renderer
  if (rendererUrl) {
    mainWindow.loadURL(rendererUrl)
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
    memoryService.flush().catch(() => {})
    closeDatabase()
  })
}
