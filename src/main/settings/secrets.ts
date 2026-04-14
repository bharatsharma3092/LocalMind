import { safeStorage, app } from 'electron'
import ElectronStore from 'electron-store'
import { existsSync, unlinkSync } from 'fs'
import { join } from 'path'

interface Secrets {
  apiKeys: Record<string, string>
}

function createSecretsStore(): ElectronStore<Secrets> {
  try {
    return new ElectronStore<Secrets>({
      name: 'localmind-secrets',
      defaults: { apiKeys: {} },
    })
  } catch {
    const secretsPath = join(app.getPath('userData'), 'localmind-secrets.json')
    if (existsSync(secretsPath)) {
      try { unlinkSync(secretsPath) } catch {}
    }
    return new ElectronStore<Secrets>({
      name: 'localmind-secrets',
      defaults: { apiKeys: {} },
    })
  }
}

const secretsStore = createSecretsStore()

export async function getSecret(service: string): Promise<string | null> {
  const encrypted = secretsStore.get('apiKeys', {})[service]
  if (!encrypted) return null
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
    }
    return encrypted
  } catch {
    return encrypted
  }
}

export async function setSecret(service: string, value: string): Promise<void> {
  const keys = secretsStore.get('apiKeys', {})
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(value)
    keys[service] = encrypted.toString('base64')
  } else {
    keys[service] = value
  }
  secretsStore.set('apiKeys', keys)
}

export async function deleteSecret(service: string): Promise<void> {
  const keys = secretsStore.get('apiKeys', {})
  delete keys[service]
  secretsStore.set('apiKeys', keys)
}
