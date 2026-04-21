import assert from 'node:assert/strict'
import test from 'node:test'

import { createAccountTokenBroker } from '../src/server/accountTokenBroker.ts'

test('token broker returns current token when not expired', async () => {
  const broker = createAccountTokenBroker({
    refresh: async () => {
      throw new Error('refresh should not be called')
    },
    now: () => new Date('2026-04-21T10:00:00.000Z'),
  })

  const result = await broker.getUsableAccessToken({
    profileId: 'profile-1',
    tokenPayload: {
      accessToken: 'token-current',
      chatgptAccountId: 'account-1',
      chatgptPlanType: 'plus',
      expiresAtIso: '2026-04-21T10:30:00.000Z',
    },
  })

  assert.equal(result.accessToken, 'token-current')
  assert.equal(result.chatgptAccountId, 'account-1')
})

test('token broker refreshes expired token', async () => {
  const broker = createAccountTokenBroker({
    refresh: async ({ profileId }) => {
      assert.equal(profileId, 'profile-2')
      return {
        accessToken: 'token-new',
        chatgptAccountId: 'account-2',
        chatgptPlanType: 'pro',
        expiresAtIso: '2026-04-21T12:00:00.000Z',
      }
    },
    now: () => new Date('2026-04-21T10:00:00.000Z'),
  })

  const result = await broker.getUsableAccessToken({
    profileId: 'profile-2',
    tokenPayload: {
      accessToken: 'token-old',
      chatgptAccountId: 'account-2',
      chatgptPlanType: 'plus',
      expiresAtIso: '2026-04-21T09:59:59.000Z',
    },
  })

  assert.equal(result.accessToken, 'token-new')
  assert.equal(result.chatgptPlanType, 'pro')
})
