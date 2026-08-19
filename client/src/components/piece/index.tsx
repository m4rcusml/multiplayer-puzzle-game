import type { PointerEvent as ReactPointerEvent } from 'react'

export type PuzzlePiece = {
  id: string
  x: number
  y: number
  targetX: number
  targetY: number
  color: string
  image?: string
  columns?: number
  rows?: number
  row?: number
  column?: number
  groupId?: string
  locked: boolean
}

type PieceProps = {
  piece: PuzzlePiece
  selected: boolean
  showLabel?: boolean
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>, piece: PuzzlePiece) => void
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>, piece: PuzzlePiece) => void
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>, piece: PuzzlePiece) => void
}

export function Piece({ piece, selected, showLabel = true, onPointerDown, onPointerMove, onPointerUp }: PieceProps) {
  return (
    <div
      className={`piece${selected ? ' piece--selected' : ''}${piece.locked ? ' piece--locked' : ''}`}
      role="button"
      tabIndex={piece.locked ? -1 : 0}
      aria-label={`Peça ${piece.id}`}
      aria-pressed={selected}
      style={{
        left: `${piece.x * 100}%`,
        top: `${piece.y * 100}%`,
        width: `${70 / (piece.columns ?? 1)}%`,
        height: `${70 / (piece.rows ?? 1)}%`,
        backgroundColor: piece.color,
        backgroundImage: piece.image ? `url(${piece.image})` : undefined,
        backgroundSize: `${(piece.columns ?? 1) * 100}% ${(piece.rows ?? 1) * 100}%`,
        backgroundPosition: `${piece.columns === 1 ? 0 : ((piece.column ?? 0) / ((piece.columns ?? 1) - 1)) * 100}% ${piece.rows === 1 ? 0 : ((piece.row ?? 0) / ((piece.rows ?? 1) - 1)) * 100}%`,
      }}
      onPointerDown={event => { event.stopPropagation(); onPointerDown(event, piece) }}
      onPointerMove={event => onPointerMove(event, piece)}
      onPointerUp={event => onPointerUp(event, piece)}
    >
      {showLabel ? piece.id.replace('piece-', '') : ''}
    </div>
  )
}
