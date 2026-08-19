import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  clampGroupDelta,
  groupPieces,
  overlapsOtherGroup,
  pieceSize,
  snapGroupToNeighbor,
  type GeometryPiece,
} from '../src/room-geometry.ts'

function piece(overrides: Partial<GeometryPiece> = {}): GeometryPiece {
  return {
    id: 'piece-1',
    x: 0.5,
    y: 0.5,
    targetX: 0.25,
    targetY: 0.25,
    columns: 4,
    rows: 2,
    ...overrides,
  }
}

describe('room geometry', () => {
  it('calculates centered piece dimensions from the grid', () => {
    assert.deepEqual(pieceSize(piece()), { width: 0.175, height: 0.35 })
  })

  it('finds both grouped pieces and a singleton group', () => {
    const pieces = [piece({ id: 'a', groupId: 'group-a' }), piece({ id: 'b', groupId: 'group-a' }), piece({ id: 'c' })]

    assert.deepEqual(groupPieces(pieces, 'group-a').map(item => item.id), ['a', 'b'])
    assert.deepEqual(groupPieces(pieces, 'c').map(item => item.id), ['c'])
  })

  it('clamps a moving group so every rectangle stays inside the board', () => {
    const pieces = [piece({ id: 'a', x: 0.1, y: 0.2, groupId: 'group-a' }), piece({ id: 'b', x: 0.4, y: 0.8, groupId: 'group-a' })]

    const delta = clampGroupDelta(pieces, 'group-a', -0.2, 0.3)
    assert.ok(Math.abs(delta.dx - -0.0125) < 1e-12)
    assert.ok(Math.abs(delta.dy - 0.025) < 1e-12)
  })

  it('detects a moved group intersecting another group', () => {
    const pieces = [
      piece({ id: 'moving', x: 0.3, y: 0.5, groupId: 'moving-group' }),
      piece({ id: 'other', x: 0.7, y: 0.5, groupId: 'other-group' }),
    ]

    assert.equal(overlapsOtherGroup(pieces, 'moving-group', 0.3, 0), true)
    assert.equal(overlapsOtherGroup(pieces, 'moving-group', 0.1, 0), false)
  })

  it('joins a group using the exact target offset of an adjacent piece', () => {
    const pieces = [
      piece({ id: 'left', x: 0.4, targetX: 0.2375, targetY: 0.325, groupId: 'left-group' }),
      piece({ id: 'right', x: 0.6, targetX: 0.4125, targetY: 0.325, groupId: 'right-group' }),
    ]

    const snapped = snapGroupToNeighbor(pieces, 'left')

    assert.ok(snapped)
    assert.equal(snapped.find(item => item.id === 'left')?.x, 0.425)
    assert.equal(snapped.find(item => item.id === 'left')?.groupId, 'right-group')
    assert.equal(snapped.find(item => item.id === 'right')?.groupId, 'right-group')
  })

  it('returns undefined when a piece has no adjacent target neighbor', () => {
    assert.equal(snapGroupToNeighbor([piece()], 'piece-1'), undefined)
  })
})
