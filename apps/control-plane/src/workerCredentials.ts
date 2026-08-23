import { readFileSync } from 'node:fs'

export function loadWorkerCredentials({
  filePath,
  legacyCredential,
}: {
  filePath?: string
  legacyCredential?: { keyId: string; secret: string }
}): Map<string, string> {
  const credentials = new Map<string, string>()
  const normalizedPath = filePath?.trim()
  if (normalizedPath) {
    let parsed: unknown
    try {
      parsed = JSON.parse(readFileSync(normalizedPath, 'utf8'))
    } catch (error) {
      throw new Error(
        `Unable to read NEBULA_WORKER_CREDENTIALS_FILE: ${
          error instanceof Error ? error.message : 'invalid credential file'
        }`,
      )
    }
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      throw new Error('NEBULA_WORKER_CREDENTIALS_FILE must contain a JSON object')
    }
    for (const [keyId, secret] of Object.entries(parsed)) {
      addCredential(credentials, keyId, secret)
    }
  }
  if (legacyCredential?.keyId.trim() || legacyCredential?.secret.trim()) {
    addCredential(
      credentials,
      legacyCredential.keyId,
      legacyCredential.secret,
    )
  }
  return credentials
}

function addCredential(
  credentials: Map<string, string>,
  rawKeyId: string,
  rawSecret: unknown,
): void {
  const keyId = rawKeyId.trim()
  const secret = typeof rawSecret === 'string' ? rawSecret.trim() : ''
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(keyId)) {
    throw new Error(`Invalid worker credential key ID: ${keyId || '(empty)'}`)
  }
  if (secret.length < 32) {
    throw new Error(`Worker credential ${keyId} must contain at least 32 characters`)
  }
  credentials.set(keyId, secret)
}
