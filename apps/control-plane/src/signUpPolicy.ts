const defaultAllowedSignUpEmail = 'beta@nubols.com'

export function allowedSignUpEmailsFromEnvironment(
  value = process.env.NEBULA_SIGNUP_ALLOWED_EMAILS,
): string[] {
  const addresses = (value?.trim() || defaultAllowedSignUpEmail)
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean)

  if (addresses.length === 0 || addresses.some(email => (
    email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ))) {
    throw new Error('NEBULA_SIGNUP_ALLOWED_EMAILS must contain valid comma-separated email addresses')
  }

  return [...new Set(addresses)]
}
