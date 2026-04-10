import ElectronStore from 'electron-store'

interface Secrets {
  apiKeys: Record<string, string>
}

const secretsStore = new ElectronStore<Secrets>({
  name: 'localmind-secrets',
  encryptionKey: 'localmind-local-encryption',
  defaults: { apiKeys: {} },
})

export async function getSecret(service: string): Promise<string | null> {
  return secretsStore.get('apiKeys', {})[service] ?? null
}

export async function setSecret(service: string, value: string): Promise<void> {
  const keys = secretsStore.get('apiKeys', {})
  keys[service] = value
  secretsStore.set('apiKeys', keys)
}

export async function deleteSecret(service: string): Promise<void> {
  const keys = secretsStore.get('apiKeys', {})
  delete keys[service]
  secretsStore.set('apiKeys', keys)
}
