import { useEffect, useRef, useState, type PointerEvent } from 'react'
import io, { type Socket } from 'socket.io-client'
import { Piece, type PuzzlePiece } from './components/piece'

const piecesAtStart: PuzzlePiece[] = [
  { id: '1', x: .15, y: .2, targetX: .25, targetY: .25, color: '#ef6c6c', locked: false },
  { id: '2', x: .8, y: .2, targetX: .75, targetY: .25, color: '#f3b562', locked: false },
  { id: '3', x: .2, y: .8, targetX: .25, targetY: .75, color: '#67c587', locked: false },
  { id: '4', x: .8, y: .8, targetX: .75, targetY: .75, color: '#66a9e8', locked: false },
]

export default function Game() {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [pieces, setPieces] = useState(piecesAtStart)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const boardRef = useRef<HTMLElement>(null)
  const dragging = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null)

  function send(piece: PuzzlePiece) {
    socket?.emit('send_position', { id: piece.id, x: piece.x, y: piece.y, locked: piece.locked })
  }

  function move(piece: PuzzlePiece, x: number, y: number, locked = piece.locked) {
    const next = { ...piece, x, y, locked }
    setPieces(current => current.map(item => item.id === piece.id ? next : item))
    send(next)
  }

  function pointerDown(event: PointerEvent<HTMLDivElement>, piece: PuzzlePiece) {
    if (piece.locked || !boardRef.current) return
    const board = boardRef.current.getBoundingClientRect()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragging.current = {
      id: piece.id,
      offsetX: event.clientX - board.left - piece.x * board.width,
      offsetY: event.clientY - board.top - piece.y * board.height,
    }
    setSelectedId(piece.id)
  }

  function pointerMove(event: PointerEvent<HTMLDivElement>, piece: PuzzlePiece) {
    const board = boardRef.current?.getBoundingClientRect()
    const drag = dragging.current
    if (!board || !drag || drag.id !== piece.id) return

    const x = Math.max(.05, Math.min(.95, (event.clientX - board.left - drag.offsetX) / board.width))
    const y = Math.max(.08, Math.min(.92, (event.clientY - board.top - drag.offsetY) / board.height))
    move(piece, x, y, false)
  }

  function pointerUp(event: PointerEvent<HTMLDivElement>, piece: PuzzlePiece) {
    if (!dragging.current || dragging.current.id !== piece.id) return
    const fits = Math.hypot(piece.x - piece.targetX, piece.y - piece.targetY) < .08
    move(piece, fits ? piece.targetX : piece.x, fits ? piece.targetY : piece.y, fits)
    event.currentTarget.releasePointerCapture(event.pointerId)
    dragging.current = null
    setSelectedId(null)
  }

  useEffect(() => {
    if (!socket) return
    const receive = (data: { id: string; x: number; y: number; locked: boolean }) => {
      setPieces(current => current.map(piece => piece.id === data.id
        ? { ...piece, x: data.x, y: data.y, locked: data.locked }
        : piece))
    }
    socket.on('receive_position', receive)
    return () => { socket.off('receive_position', receive) }
  }, [socket])

  return (
    <div className="game">
      <div className="toolbar">
        <span>{pieces.filter(piece => piece.locked).length}/{pieces.length} peças</span>
        {!socket
          ? <button onClick={() => setSocket(io('http://localhost:3000'))}>Conectar</button>
          : <button onClick={() => { socket.disconnect(); setSocket(null) }}>Desconectar</button>}
      </div>
      <main ref={boardRef} className="board" onPointerDown={() => setSelectedId(null)}>
        {pieces.map(piece => <div key={`target-${piece.id}`} className="target" style={{ left: `${piece.targetX * 100}%`, top: `${piece.targetY * 100}%` }} />)}
        {pieces.map(piece => <Piece key={piece.id} piece={piece} selected={selectedId === piece.id} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} />)}
      </main>
    </div>
  )
}
