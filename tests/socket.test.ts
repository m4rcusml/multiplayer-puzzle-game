import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { socketEndpoint } from '../client/src/socket.ts'

describe('socket endpoint', () => {
  it('uses the current page origin so ngrok can proxy the connection', () => {
    assert.equal(socketEndpoint(), undefined)
  })
})
