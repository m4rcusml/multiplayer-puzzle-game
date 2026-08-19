import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import io, { type Socket } from 'socket.io-client'
import { Piece, type PuzzlePiece } from './components/piece'
import { socketEndpoint } from './socket'

const SNAP_DISTANCE = 0.08

const initialPieces: PuzzlePiece[] = [
  { id: 'piece-1', x: 0.12, y: 0.16, targetX: 0.25, targetY: 0.25, color: '#ef6c6c', locked: false },
  { id: 'piece-2', x: 0.78, y: 0.18, targetX: 0.5, targetY: 0.25, color: '#f3b562', locked: false },
  { id: 'piece-3', x: 0.2, y: 0.8, targetX: 0.75, targetY: 0.25, color: '#67c587', locked: false },
  { id: 'piece-4', x: 0.72, y: 0.72, targetX: 0.25, targetY: 0.5, color: '#66a9e8', locked: false },
  { id: 'piece-5', x: 0.48, y: 0.78, targetX: 0.5, targetY: 0.5, color: '#a984e8', locked: false },
  { id: 'piece-6', x: 0.52, y: 0.16, targetX: 0.75, targetY: 0.5, color: '#e982c5', locked: false },
  { id: 'piece-7', x: 0.16, y: 0.48, targetX: 0.25, targetY: 0.75, color: '#61c9c2', locked: false },
  { id: 'piece-8', x: 0.82, y: 0.48, targetX: 0.5, targetY: 0.75, color: '#d3c45d', locked: false },
  { id: 'piece-9', x: 0.5, y: 0.5, targetX: 0.75, targetY: 0.75, color: '#bd8b62', locked: false },
]

type PieceEvent = Pick<PuzzlePiece, 'id' | 'x' | 'y' | 'locked'>

function isPieceEvent(data: unknown): data is PieceEvent {
  if (!data || typeof data !== 'object') return false
  const value = data as Record<string, unknown>
  return typeof value.id === 'string' && typeof value.x === 'number' && typeof value.y === 'number' && typeof value.locked === 'boolean'
}

function App() {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [pieces, setPieces] = useState<PuzzlePiece[]>(initialPieces)
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null)
  const boardRef = useRef<HTMLElement>(null)
  const dragRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null)

  function emitPiecePosition(piece: PuzzlePiece) {
    socket?.emit('send_position', { id: piece.id, x: piece.x, y: piece.y, locked: piece.locked } satisfies PieceEvent)
  }

  function updatePiece(id: string, x: number, y: number, locked = false) {
    const currentPiece = pieces.find(piece => piece.id === id)
    if (!currentPiece) return undefined

    const changedPiece = { ...currentPiece, x, y, locked }
    setPieces(current => current.map(piece => {
      if (piece.id !== id) return piece
      return changedPiece
    }))
    return changedPiece
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>, piece: PuzzlePiece) {
    if (piece.locked || !boardRef.current) return
    const board = boardRef.current.getBoundingClientRect()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      id: piece.id,
      offsetX: event.clientX - (board.left + piece.x * board.width),
      offsetY: event.clientY - (board.top + piece.y * board.height),
    }
    setSelectedPieceId(piece.id)
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>, piece: PuzzlePiece) {
    const drag = dragRef.current
    const board = boardRef.current?.getBoundingClientRect()
    if (!drag || drag.id !== piece.id || !board) return
    const x = Math.max(0.04, Math.min(0.96, (event.clientX - drag.offsetX - board.left) / board.width))
    const y = Math.max(0.06, Math.min(0.94, (event.clientY - drag.offsetY - board.top) / board.height))
    const changedPiece = updatePiece(piece.id, x, y)
    if (changedPiece) emitPiecePosition(changedPiece)
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>, piece: PuzzlePiece) {
    if (!dragRef.current || dragRef.current.id !== piece.id) return
    const closeToTarget = Math.hypot(piece.x - piece.targetX, piece.y - piece.targetY) < SNAP_DISTANCE
    const changedPiece = updatePiece(piece.id, closeToTarget ? piece.targetX : piece.x, closeToTarget ? piece.targetY : piece.y, closeToTarget)
    if (changedPiece) emitPiecePosition(changedPiece)
    event.currentTarget.releasePointerCapture(event.pointerId)
    dragRef.current = null
    setSelectedPieceId(null)
  }

  function connect() {
    setSocket(io(socketEndpoint()))
  }

  function disconnect() {
    socket?.disconnect()
    setSocket(null)
    setSelectedPieceId(null)
  }

  useEffect(() => {
    if (socket == null) return;

    function handlePiecePosition(data: unknown) {
      if (!isPieceEvent(data)) return
      setPieces(current => current.map(piece => piece.id === data.id ? { ...piece, x: data.x, y: data.y, locked: data.locked } : piece))
    }

    socket.on('receive_position', handlePiecePosition)
    const handleConnectionError = (error: Error) => console.error('Erro ao conectar:', error.message)
    socket.on('connect_error', handleConnectionError)

    return () => {
      socket.off('receive_position', handlePiecePosition)
      socket.off('connect_error', handleConnectionError)
    }
  }, [socket])

  const completedPieces = pieces.filter(piece => piece.locked).length

  return (
    <>
      <div className="game-shell">
        <header className="game-header">
          <div><p className="eyebrow">Puzzle multiplayer</p><h1>Monte a imagem juntos</h1></div>
          <div className="game-actions"><span>{completedPieces}/{pieces.length} peças</span>{!socket ? <button onClick={connect}>Conectar</button> : <button onClick={disconnect}>Desconectar</button>}</div>
        </header>
        <main ref={boardRef} className="puzzle-board" onPointerDown={() => setSelectedPieceId(null)}>
          <div className="target-grid" aria-hidden="true">{pieces.map(piece => <div key={piece.id} className="target-slot" style={{ left: `${piece.targetX * 100}%`, top: `${piece.targetY * 100}%` }} />)}</div>
          {pieces.map(piece => <Piece key={piece.id} piece={piece} selected={selectedPieceId === piece.id} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} />)}
        </main>
        <p className="hint">Clique e arraste uma peça até o lugar indicado. Ela será encaixada automaticamente quando estiver próxima.</p>
      </div>
    </>
  )
}

export default App
