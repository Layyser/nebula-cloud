import { createAuthClient } from 'better-auth/react'
import { organizationClient } from 'better-auth/client/plugins'

const configuredBaseURL = import.meta.env.VITE_NEBULA_CONTROL_PLANE_BASE?.trim()

export const authClient = createAuthClient({
  ...(configuredBaseURL ? { baseURL: configuredBaseURL } : {}),
  plugins: [organizationClient()],
})

export type CloudSession = typeof authClient.$Infer.Session
