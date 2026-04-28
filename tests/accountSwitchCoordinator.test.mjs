import assert from 'node:assert/strict'
import test from 'node:test'

import { createAccountSwitchCoordinator } from '../src/server/accountSwitchCoordinator.ts'

test('switch coordinator logs in target profile and updates active profile', async () => {
  let activeProfileId = 'profile-1'
  const loginCalls = []
  const coordinator = createAccountSwitchCoordinator({
    readSnapshot: async () => ({
      activeProfileId,
      profiles: [
        {
          profileId: 'profile-1',
          accountId: 'account-1',
          tokenPayload: { accessToken: 'token-1', chatgptAccountId: 'account-1', chatgptPlanType: 'plus', expiresAtIso: null },
        },
        {
          profileId: 'profile-2',
          accountId: 'account-2',
          tokenPayload: { accessToken: 'token-2', chatgptAccountId: 'account-2', chatgptPlanType: 'pro', expiresAtIso: null },
        },
      ],
    }),
    setActiveProfile: async (nextProfileId) => {
      activeProfileId = nextProfileId
    },
    getUsableAccessToken: async (profile) => profile.tokenPayload,
    loginWithAuthTokens: async (payload) => {
      loginCalls.push(payload)
    },
  })

  const result = await coordinator.switchTo('profile-2')

  assert.equal(result.activeProfileId, 'profile-2')
  assert.equal(result.previousProfileId, 'profile-1')
  assert.equal(activeProfileId, 'profile-2')
  assert.equal(loginCalls.length, 1)
  assert.equal(loginCalls[0].chatgptAccountId, 'account-2')
})

test('switch coordinator keeps previous active profile when login fails', async () => {
  let activeProfileId = 'profile-1'
  const coordinator = createAccountSwitchCoordinator({
    readSnapshot: async () => ({
      activeProfileId,
      profiles: [
        {
          profileId: 'profile-1',
          accountId: 'account-1',
          tokenPayload: { accessToken: 'token-1', chatgptAccountId: 'account-1', chatgptPlanType: 'plus', expiresAtIso: null },
        },
        {
          profileId: 'profile-2',
          accountId: 'account-2',
          tokenPayload: { accessToken: 'token-2', chatgptAccountId: 'account-2', chatgptPlanType: 'pro', expiresAtIso: null },
        },
      ],
    }),
    setActiveProfile: async (nextProfileId) => {
      activeProfileId = nextProfileId
    },
    getUsableAccessToken: async (profile) => profile.tokenPayload,
    loginWithAuthTokens: async () => {
      throw new Error('login failed')
    },
  })

  await assert.rejects(coordinator.switchTo('profile-2'), /login failed/i)
  assert.equal(activeProfileId, 'profile-1')
})

test('switch coordinator invokes switched hook after successful switch', async () => {
  let activeProfileId = 'profile-1'
  const switchedEvents = []
  const coordinator = createAccountSwitchCoordinator({
    readSnapshot: async () => ({
      activeProfileId,
      profiles: [
        {
          profileId: 'profile-1',
          accountId: 'account-1',
          tokenPayload: { accessToken: 'token-1', chatgptAccountId: 'account-1', chatgptPlanType: 'plus', expiresAtIso: null },
        },
        {
          profileId: 'profile-2',
          accountId: 'account-2',
          tokenPayload: { accessToken: 'token-2', chatgptAccountId: 'account-2', chatgptPlanType: 'pro', expiresAtIso: null },
        },
      ],
    }),
    setActiveProfile: async (nextProfileId) => {
      activeProfileId = nextProfileId
    },
    getUsableAccessToken: async (profile) => profile.tokenPayload,
    loginWithAuthTokens: async () => {},
    onSwitched: async (payload) => {
      switchedEvents.push(payload)
    },
  })

  await coordinator.switchTo('profile-2')
  assert.equal(switchedEvents.length, 1)
  assert.equal(switchedEvents[0].activeProfileId, 'profile-2')
  assert.equal(switchedEvents[0].previousProfileId, 'profile-1')
})
