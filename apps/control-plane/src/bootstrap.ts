import { initializePersistence } from './persistence'
import { allowedSignUpEmailsFromEnvironment } from './signUpPolicy'

const databasePath = process.env.NEBULA_CLOUD_DATABASE_PATH?.trim()
  || './data/nebula-cloud.sqlite'
const baseURL = process.env.BETTER_AUTH_URL?.trim()
  || 'http://127.0.0.1:7790'
const secret = process.env.BETTER_AUTH_SECRET?.trim() || ''
const name = process.env.NEBULA_BOOTSTRAP_NAME?.trim() || ''
const email = process.env.NEBULA_BOOTSTRAP_EMAIL?.trim() || ''
const password = process.env.NEBULA_BOOTSTRAP_PASSWORD || ''
const trustedOrigins = (process.env.NEBULA_CLOUD_TRUSTED_ORIGINS
  || 'http://127.0.0.1:5173')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean)
const origin = trustedOrigins[0]

if (!name || !email || !password) {
  throw new Error(
    'NEBULA_BOOTSTRAP_NAME, NEBULA_BOOTSTRAP_EMAIL, and '
    + 'NEBULA_BOOTSTRAP_PASSWORD are required',
  )
}
if (password.length < 8) {
  throw new Error('NEBULA_BOOTSTRAP_PASSWORD must contain at least 8 characters')
}

const { auth, database } = await initializePersistence({
  databasePath,
  authSecret: secret,
  authBaseURL: baseURL,
  trustedOrigins,
  allowedSignUpEmails: allowedSignUpEmailsFromEnvironment(),
})

try {
  const signUp = await auth.handler(authRequest('/api/auth/sign-up/email', {
    name,
    email,
    password,
  }))

  if (signUp.ok) {
    console.log('Bootstrap account created')
  } else {
    const signIn = await auth.handler(authRequest('/api/auth/sign-in/email', {
      email,
      password,
    }))
    if (!signIn.ok) {
      throw new Error(
        `Bootstrap account already exists but the configured credentials `
        + `were rejected (${signIn.status})`,
      )
    }
    console.log('Bootstrap account verified')
  }
} finally {
  database.close()
}

function authRequest(path: string, body: Record<string, string>): Request {
  return new Request(new URL(path, baseURL), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin,
    },
    body: JSON.stringify(body),
  })
}
