// Which terms and privacy policy someone agreed to, kept in their account's user_metadata

// Bump when the terms or privacy policy change in a way people must agree to again
export const LEGAL_VERSION = '2026-10-26'

// Saved at sign-up, or on the one-time consent screen for older accounts
export const consentMetadata = (now = new Date().toISOString()) =>
  ({ legal_version: LEGAL_VERSION, terms_accepted_at: now, health_consent_at: now })

export const hasConsented = user => user?.user_metadata?.legal_version === LEGAL_VERSION && !!user.user_metadata.health_consent_at
