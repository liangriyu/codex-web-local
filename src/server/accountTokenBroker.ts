import type { AccountTokenPayload } from './accountProfileStore.ts'

export type AccountTokenBrokerProfile = {
  profileId: string
  tokenPayload: AccountTokenPayload | null
}

export type AccountTokenBrokerOptions = {
  refresh: (profile: AccountTokenBrokerProfile) => Promise<AccountTokenPayload>
  now?: () => Date
}

function parseTimestamp(value: string | null): number | null {
  if (!value) return null
  const timestamp = new Date(value).getTime()
  return Number.isNaN(timestamp) ? null : timestamp
}

function isTokenExpired(tokenPayload: AccountTokenPayload, now: Date): boolean {
  const expiresAtMs = parseTimestamp(tokenPayload.expiresAtIso)
  if (expiresAtMs === null) return false
  return expiresAtMs <= now.getTime()
}

export function createAccountTokenBroker(options: AccountTokenBrokerOptions) {
  const nowReader = options.now ?? (() => new Date())

  return {
    async getUsableAccessToken(profile: AccountTokenBrokerProfile): Promise<AccountTokenPayload> {
      const currentPayload = profile.tokenPayload
      if (currentPayload && !isTokenExpired(currentPayload, nowReader())) {
        return currentPayload
      }
      return options.refresh(profile)
    },
  }
}
