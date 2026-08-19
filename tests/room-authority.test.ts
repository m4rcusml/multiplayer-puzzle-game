import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  applyGroupMove,
  claimGroup,
  createRoom,
  assignHostIfMissing,
  publicRoom,
  releaseGroup,
  roomSnapshot,
} from '../index.ts'

const roomRequest = {
  id: 'ROOM01',
  password: 'secret',
  image: 'data:image/png;base64,AA==',
  columns: 2,
  rows: 2,
}

describe('room authority', () => {
  it('makes the creator host and only exposes the password in their snapshot', () => {
    const room = createRoom(roomRequest, 'creator')

    assert.equal(room.hostId, 'creator')
    assert.equal(room.showLabels, false)
    assert.deepEqual(roomSnapshot(room, 'creator'), {
      room: publicRoom(room),
      isHost: true,
      showLabels: false,
      roomPassword: 'secret',
    })
    assert.deepEqual(roomSnapshot(room, 'joiner'), {
      room: publicRoom(room),
      isHost: false,
      showLabels: false,
    })
    assert.equal('password' in publicRoom(room), false)
    assert.equal('locks' in publicRoom(room), false)
  })

  it('denies a group locked by another socket and releases only the owner lock', () => {
    const room = createRoom(roomRequest, 'creator')

    assert.deepEqual(claimGroup(room, 'group-1', 'creator'), { ok: true })
    assert.deepEqual(claimGroup(room, 'group-1', 'joiner'), { ok: false, error: 'Grupo em uso.' })
    assert.equal(releaseGroup(room, 'group-1', 'joiner'), false)
    assert.deepEqual(claimGroup(room, 'group-1', 'joiner'), { ok: false, error: 'Grupo em uso.' })
    assert.equal(releaseGroup(room, 'group-1', 'creator'), true)
    assert.deepEqual(claimGroup(room, 'group-1', 'joiner'), { ok: true })
  })

  it('assigns an orphaned room to its first new participant', () => {
    const room = createRoom(roomRequest, 'departed-host')

    assert.equal(assignHostIfMissing(room, [], 'new-host'), true)
    assert.equal(room.hostId, 'new-host')
    assert.equal(assignHostIfMissing(room, ['new-host'], 'other'), false)
  })

  it('moves a connected group without deleting metadata omitted from the payload', () => {
    const room = createRoom(roomRequest, 'creator')
    const [first, second] = room.pieces
    first!.groupId = 'connected'
    second!.groupId = 'connected'
    claimGroup(room, 'connected', 'creator')
    const firstX = first!.x
    const secondX = second!.x

    const result = applyGroupMove(room, {
      sourceGroupId: 'connected',
      pieces: [{ id: first!.id, x: firstX + 0.02, y: first!.y, locked: false, groupId: 'connected' }],
    }, 'creator')

    assert.equal(result.ok, true)
    assert.ok(Math.abs(first!.x - (firstX + 0.02)) < 1e-12)
    assert.ok(Math.abs(second!.x - (secondX + 0.02)) < 1e-12)
    assert.equal(first!.groupId, 'connected')
    assert.equal(second!.groupId, 'connected')
  })

  it('uses the explicit source group when a snap payload starts with the target piece', () => {
    const room = createRoom(roomRequest, 'creator')
    const [source, target] = room.pieces
    claimGroup(room, source!.id, 'creator')
    const targetGroupId = target!.id

    const result = applyGroupMove(room, {
      sourceGroupId: source!.id,
      pieces: [
        { id: target!.id, x: target!.x, y: target!.y, locked: false },
        { id: source!.id, x: source!.x + 0.01, y: source!.y, locked: false, groupId: targetGroupId },
      ],
    }, 'creator')

    assert.equal(result.ok, true)
    assert.equal(source!.groupId, targetGroupId)
    assert.equal(result.pieces.some(piece => piece.id === target!.id), true)
  })

  it('rejects merging into a group locked by another participant', () => {
    const room = createRoom(roomRequest, 'creator')
    const [source, target] = room.pieces
    claimGroup(room, source!.id, 'creator')
    claimGroup(room, target!.id, 'joiner')

    const result = applyGroupMove(room, {
      sourceGroupId: source!.id,
      pieces: [{ id: source!.id, x: source!.x, y: source!.y, locked: false, groupId: target!.id }],
    }, 'creator')

    assert.equal(result.ok, false)
    assert.equal(source!.groupId, undefined)
  })

  it('rejects a snap when the board edge would change its exact displacement', () => {
    const room = createRoom(roomRequest, 'creator')
    const [source, target] = room.pieces
    source!.x = 0.2
    source!.y = 0.5
    target!.x = 0.8
    target!.y = 0.5
    claimGroup(room, source!.id, 'creator')

    const result = applyGroupMove(room, {
      sourceGroupId: source!.id,
      pieces: [{ id: source!.id, x: 0.95, y: 0.5, locked: false, groupId: target!.id }],
    }, 'creator')

    assert.equal(result.ok, false)
    assert.equal(source!.x, 0.2)
    assert.equal(source!.groupId, undefined)
  })

  it('requires the source group id instead of inferring it from payload order', () => {
    const room = createRoom(roomRequest, 'creator')
    const source = room.pieces[0]!
    claimGroup(room, source.id, 'creator')

    const result = applyGroupMove(room, {
      pieces: [{ id: source.id, x: source.x + 0.01, y: source.y, locked: false }],
    }, 'creator')

    assert.equal(result.ok, false)
  })
})
