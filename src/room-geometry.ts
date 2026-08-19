export type GeometryPiece = {
  id: string
  x: number
  y: number
  targetX: number
  targetY: number
  columns: number
  rows: number
  groupId?: string
}

export function pieceSize(piece: GeometryPiece): { width: number; height: number } {
  return { width: 0.7 / piece.columns, height: 0.7 / piece.rows }
}

export function groupPieces(pieces: GeometryPiece[], groupId: string): GeometryPiece[] {
  return pieces.filter(piece => piece.groupId === groupId || (piece.groupId === undefined && piece.id === groupId))
}

function rectangle(piece: GeometryPiece, dx = 0, dy = 0) {
  const { width, height } = pieceSize(piece)
  return {
    left: piece.x + dx - width / 2,
    right: piece.x + dx + width / 2,
    top: piece.y + dy - height / 2,
    bottom: piece.y + dy + height / 2,
  }
}

function intersects(first: ReturnType<typeof rectangle>, second: ReturnType<typeof rectangle>): boolean {
  return first.left < second.right && first.right > second.left && first.top < second.bottom && first.bottom > second.top
}

export function clampGroupDelta(pieces: GeometryPiece[], movingGroupId: string, dx: number, dy: number): { dx: number; dy: number } {
  const moving = groupPieces(pieces, movingGroupId)
  if (moving.length === 0) return { dx, dy }

  let clampedX = dx
  let clampedY = dy
  for (const piece of moving) {
    const bounds = rectangle(piece)
    clampedX = Math.max(-bounds.left, Math.min(1 - bounds.right, clampedX))
    clampedY = Math.max(-bounds.top, Math.min(1 - bounds.bottom, clampedY))
  }
  return { dx: clampedX, dy: clampedY }
}

export function overlapsOtherGroup(pieces: GeometryPiece[], movingGroupId: string, dx: number, dy: number): boolean {
  const moving = groupPieces(pieces, movingGroupId)
  const others = pieces.filter(piece => !moving.includes(piece))
  return moving.some(piece => {
    const movedBounds = rectangle(piece, dx, dy)
    return others.some(other => intersects(movedBounds, rectangle(other)))
  })
}

export function snapGroupToNeighbor(pieces: GeometryPiece[], pieceId: string): GeometryPiece[] | undefined {
  const piece = pieces.find(item => item.id === pieceId)
  if (!piece) return undefined

  const movingGroupId = piece.groupId ?? piece.id
  const moving = groupPieces(pieces, movingGroupId)
  const { width, height } = pieceSize(piece)
  const neighbor = pieces.find(other => {
    if (other.id === piece.id || (other.groupId ?? other.id) === movingGroupId) return false
    const sameRow = Math.abs(other.targetY - piece.targetY) < 1e-9 && Math.abs(Math.abs(other.targetX - piece.targetX) - width) < 1e-9
    const sameColumn = Math.abs(other.targetX - piece.targetX) < 1e-9 && Math.abs(Math.abs(other.targetY - piece.targetY) - height) < 1e-9
    return sameRow || sameColumn
  })
  if (!neighbor) return undefined

  const deltaX = neighbor.x + (piece.targetX - neighbor.targetX) - piece.x
  const deltaY = neighbor.y + (piece.targetY - neighbor.targetY) - piece.y
  const mergedGroupId = neighbor.groupId ?? neighbor.id
  return pieces.map(item => {
    const inMovingGroup = moving.includes(item)
    const inNeighborGroup = item === neighbor || (neighbor.groupId !== undefined && item.groupId === neighbor.groupId)
    if (!inMovingGroup && !inNeighborGroup) return item
    return {
      ...item,
      x: inMovingGroup ? item.x + deltaX : item.x,
      y: inMovingGroup ? item.y + deltaY : item.y,
      groupId: mergedGroupId,
    }
  })
}
