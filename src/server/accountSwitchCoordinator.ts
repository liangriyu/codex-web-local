import type { AccountTokenPayload } from './accountProfileStore.ts'

type SwitchableAccountProfile = {
  profileId: string
  accountId: string
  tokenPayload: AccountTokenPayload | null
}

type SwitchSnapshot = {
  activeProfileId: string | null
  profiles: SwitchableAccountProfile[]
}

type LoginAuthTokenPayload = {
  accessToken: string
  chatgptAccountId: string
  chatgptPlanType: string | null
}

type AccountSwitchCoordinatorOptions = {
  readSnapshot: () => Promise<SwitchSnapshot>
  setActiveProfile: (profileId: string | null) => Promise<void>
  getUsableAccessToken: (profile: SwitchableAccountProfile) => Promise<AccountTokenPayload>
  loginWithAuthTokens: (payload: LoginAuthTokenPayload) => Promise<void>
  onSwitched?: (result: AccountSwitchResult) => Promise<void>
}

export type AccountSwitchResult = {
  activeProfileId: string
  previousProfileId: string | null
}

export function createAccountSwitchCoordinator(options: AccountSwitchCoordinatorOptions) {
  let isSwitching = false

  return {
    async switchTo(profileId: string): Promise<AccountSwitchResult> {
      const normalizedProfileId = profileId.trim()
      if (!normalizedProfileId) {
        throw new Error('Missing account profile id')
      }
      if (isSwitching) {
        throw new Error('Account switching is already in progress')
      }

      isSwitching = true
      try {
        const snapshot = await options.readSnapshot()
        const previousProfileId = snapshot.activeProfileId ?? null
        const targetProfile = snapshot.profiles.find((profile) => profile.profileId === normalizedProfileId)
        if (!targetProfile) {
          throw new Error(`Account profile not found: ${normalizedProfileId}`)
        }

        const tokenPayload = await options.getUsableAccessToken(targetProfile)
        await options.loginWithAuthTokens({
          accessToken: tokenPayload.accessToken,
          chatgptAccountId: tokenPayload.chatgptAccountId,
          chatgptPlanType: tokenPayload.chatgptPlanType ?? null,
        })
        await options.setActiveProfile(targetProfile.profileId)
        const result = {
          activeProfileId: targetProfile.profileId,
          previousProfileId,
        }
        if (options.onSwitched) {
          await options.onSwitched(result).catch(() => {})
        }
        return result
      } catch (error) {
        const snapshot = await options.readSnapshot().catch(() => null)
        const previousProfileId = snapshot?.activeProfileId ?? null
        if (previousProfileId) {
          await options.setActiveProfile(previousProfileId).catch(() => {})
        }
        throw error
      } finally {
        isSwitching = false
      }
    },
  }
}
