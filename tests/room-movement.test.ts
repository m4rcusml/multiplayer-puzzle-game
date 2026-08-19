import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createPieces } from '../index.ts'
import { overlapsOtherGroup } from '../src/room-geometry.ts'

describe('initial room movement', () => {
  it('starts every piece free of another piece so the first drag is accepted', () => {
    const pieces = createPieces(9, 4)

    for (const piece of pieces) {
      assert.equal(overlapsOtherGroup(pieces, piece.id, 0, 0), false, `piece ${piece.id} overlaps at start`)
    }
  })

  it('does not arrange pieces in horizontal row bands', () => {
    let state = 0x12345678
    const random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0
      return state / 0x100000000
    }
    const columns = 9
    const rows = 4
    const pieces = createPieces(columns, rows, random)
    const regularRowCenters = Array.from({ length: rows }, (_, row) => 0.05 + ((row + 0.5) / rows) * 0.9)

    assert.equal(
      pieces.some(piece => Math.min(...regularRowCenters.map(center => Math.abs(piece.y - center))) > 0.04),
      true,
      'all pieces are still visually aligned to horizontal row bands',
    )
  })
})
