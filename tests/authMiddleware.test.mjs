import assert from 'node:assert/strict'
import test from 'node:test'

import { createAuthMiddleware } from '../src/server/authMiddleware.ts'

function createMockResponse() {
  return {
    headers: {},
    statusCode: 200,
    jsonBody: null,
    textBody: null,
    setHeader(name, value) {
      this.headers[name] = value
    },
    status(code) {
      this.statusCode = code
      return this
    },
    json(body) {
      this.jsonBody = body
      return this
    },
    send(body) {
      this.textBody = body
      return this
    },
  }
}

test('unauthorized codex api request returns 401 json instead of login html', () => {
  const middleware = createAuthMiddleware('secret')
  const req = {
    method: 'POST',
    path: '/codex-api/rpc',
    headers: {},
  }
  const res = createMockResponse()
  let nextCalled = false

  middleware(req, res, () => {
    nextCalled = true
  })

  assert.equal(nextCalled, false)
  assert.equal(res.statusCode, 401)
  assert.deepEqual(res.jsonBody, {
    error: 'Session expired. Refresh and sign in again.',
  })
  assert.equal(res.textBody, null)
})

test('unauthorized page request still serves login html', () => {
  const middleware = createAuthMiddleware('secret')
  const req = {
    method: 'GET',
    path: '/',
    headers: {},
  }
  const res = createMockResponse()
  let nextCalled = false

  middleware(req, res, () => {
    nextCalled = true
  })

  assert.equal(nextCalled, false)
  assert.equal(res.statusCode, 200)
  assert.equal(res.headers['Content-Type'], 'text/html; charset=utf-8')
  assert.match(res.textBody, /Codex Web Local/)
  assert.equal(res.jsonBody, null)
})
