import { useRef, useState, type ChangeEvent, type PointerEvent } from 'react'
import io, { type Socket } from 'socket.io-client'
import { Piece, type PuzzlePiece } from './components/piece'

type ServerPiece = Omit<PuzzlePiece, 'image' | 'columns' | 'rows' | 'color'> & { row: number; column: number }
type Room = { id: string; image: string; columns: number; rows: number; pieces: ServerPiece[] }
type Response = { ok: boolean; error?: string; room?: Room }

function addImageData(room: Room): PuzzlePiece[] {
  return room.pieces.map(piece => ({ ...piece, image: room.image, columns: room.columns, rows: room.rows, color: 'transparent' }))
}

export default function RoomGame() {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [room, setRoom] = useState<Room | null>(null)
  const [pieces, setPieces] = useState<PuzzlePiece[]>([])
  const [mode, setMode] = useState<'create' | 'join'>('create')
  const [password, setPassword] = useState('')
  const [roomId, setRoomId] = useState('')
  const [pieceColumns, setPieceColumns] = useState(4)
  const [pieceRows, setPieceRows] = useState(4)
  const [image, setImage] = useState('')
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showLabels, setShowLabels] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const boardRef = useRef<HTMLElement>(null)
  const dragging = useRef<{ id: string; offsetX: number; offsetY: number; x: number; y: number } | null>(null)
  const lastSentAt = useRef(0)
  const pendingSend = useRef<PuzzlePiece[]>([])
  const sendTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function openRoom(response: Response, nextSocket: Socket) {
    setConnecting(false)
    if (!response.ok || !response.room) {
      setError(response.error || 'Nao foi possivel abrir a sala.')
      nextSocket.disconnect()
      return
    }
    nextSocket.on('piece_moved', (piece: ServerPiece) => setPieces(current => current.map(item => item.id === piece.id ? { ...item, ...piece } : item)))
    nextSocket.on('group_moved', (movedPieces: ServerPiece[]) => {
      const movedById = new Map(movedPieces.map(piece => [piece.id, piece]))
      setPieces(current => current.map(item => movedById.has(item.id) ? { ...item, ...movedById.get(item.id)! } : item))
    })
    setSocket(nextSocket)
    setRoom(response.room)
    setPieces(addImageData(response.room))
    setError('')
  }

  function createRoom() {
    if (!image) return setError('Escolha uma imagem primeiro.')
    const nextSocket = io('http://localhost:3000')
    setConnecting(true)
    nextSocket.once('connect_error', () => {
      setConnecting(false)
      setError('Nao foi possivel conectar ao servidor.')
      nextSocket.disconnect()
    })
    nextSocket.emit('create_room', { password, columns: pieceColumns, rows: pieceRows, image }, (response: Response) => openRoom(response, nextSocket))
  }

  function joinRoom() {
    const nextSocket = io('http://localhost:3000')
    setConnecting(true)
    nextSocket.once('connect_error', () => {
      setConnecting(false)
      setError('Nao foi possivel conectar ao servidor.')
      nextSocket.disconnect()
    })
    nextSocket.emit('join_room', { roomId, password }, (response: Response) => openRoom(response, nextSocket))
  }

  function chooseImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    const objectUrl = URL.createObjectURL(file)
    const source = new Image()
    source.onload = () => {
      const maxSize = 1600
      const scale = Math.min(1, maxSize / Math.max(source.width, source.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(source.width * scale))
      canvas.height = Math.max(1, Math.round(source.height * scale))
      canvas.getContext('2d')?.drawImage(source, 0, 0, canvas.width, canvas.height)
      setImage(canvas.toDataURL('image/jpeg', 0.82))
      URL.revokeObjectURL(objectUrl)
    }
    source.onerror = () => {
      setError('Nao foi possivel ler a imagem.')
      URL.revokeObjectURL(objectUrl)
    }
    source.src = objectUrl
  }

  function sendGroup(group: PuzzlePiece[], immediate = false) {
    const emit = (nextGroup: PuzzlePiece[]) => {
      lastSentAt.current = Date.now()
      socket?.emit('move_group', {
        roomId: room?.id,
        pieces: nextGroup.map(piece => ({ id: piece.id, x: piece.x, y: piece.y, locked: piece.locked, groupId: piece.groupId })),
      })
    }

    if (immediate || Date.now() - lastSentAt.current >= 33) {
      emit(group)
      return
    }

    pendingSend.current = group
    if (!sendTimer.current) {
      sendTimer.current = setTimeout(() => {
        sendTimer.current = null
        if (pendingSend.current.length > 0) {
          emit(pendingSend.current)
          pendingSend.current = []
        }
      }, 33)
    }
  }

  function moveGroup(id: string, dx: number, dy: number): PuzzlePiece[] {
    const piece = pieces.find(item => item.id === id)
    if (!piece) return []
    const groupId = piece.groupId ?? piece.id
    const changed = pieces.map(item => item.groupId === groupId || item.id === groupId || item.id === id
      ? { ...item, x: Math.max(0, Math.min(1, item.x + dx)), y: Math.max(0, Math.min(1, item.y + dy)) }
      : item)
    setPieces(changed)
    return changed.filter(item => item.groupId === groupId || item.id === groupId || item.id === id)
  }

  function connectPiece(id: string, draggedPiece?: PuzzlePiece): PuzzlePiece[] | undefined {
    const piece = draggedPiece ?? pieces.find(item => item.id === id)
    if (!piece) return undefined
    const movingGroup = piece.groupId ?? piece.id

    const other = pieces.find(item => {
      const adjacent = Math.abs(piece.column! - item.column!) + Math.abs(piece.row! - item.row!) === 1
      const expectedX = item.x + piece.targetX - item.targetX
      const expectedY = item.y + piece.targetY - item.targetY
      const connectionWidth = 0.7 / (piece.columns ?? 1)
      const connectionHeight = 0.7 / (piece.rows ?? 1)
      const closeEnough = Math.abs(piece.x - expectedX) <= connectionWidth * 0.4 && Math.abs(piece.y - expectedY) <= connectionHeight * 0.4
      const itemGroup = item.groupId ?? item.id
      return item.id !== id && itemGroup !== movingGroup && adjacent && closeEnough
    })
    if (!other) return undefined

    const expectedX = other.x + piece.targetX - other.targetX
    const expectedY = other.y + piece.targetY - other.targetY
    const otherGroup = other.groupId ?? other.id
    const groupId = otherGroup
    const deltaX = expectedX - piece.x
    const deltaY = expectedY - piece.y
    const connected = pieces.map(item => {
      const inMovingGroup = item.groupId === movingGroup || item.id === movingGroup || item.id === id
      const inOtherGroup = item.groupId === otherGroup || item.id === otherGroup
      if (!inMovingGroup && !inOtherGroup) return item
      if (inMovingGroup) return { ...item, x: item.x + deltaX, y: item.y + deltaY, groupId }
      return { ...item, groupId }
    })
    setPieces(connected)
    sendGroup(connected.filter(item => item.groupId === groupId), true)
    return connected
  }

  function pointerDown(event: PointerEvent<HTMLDivElement>, piece: PuzzlePiece) {
    if (!boardRef.current) return
    const board = boardRef.current.getBoundingClientRect()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragging.current = { id: piece.id, offsetX: event.clientX - board.left - piece.x * board.width, offsetY: event.clientY - board.top - piece.y * board.height, x: piece.x, y: piece.y }
    setSelectedId(piece.id)
  }

  function pointerMove(event: PointerEvent<HTMLDivElement>, piece: PuzzlePiece) {
    const board = boardRef.current?.getBoundingClientRect()
    const drag = dragging.current
    if (!board || !drag || drag.id !== piece.id) return
    const x = Math.max(0, Math.min(1, (event.clientX - board.left - drag.offsetX) / board.width))
    const y = Math.max(0, Math.min(1, (event.clientY - board.top - drag.offsetY) / board.height))
    const movedGroup = moveGroup(piece.id, x - drag.x, y - drag.y)
    drag.x = x
    drag.y = y
    sendGroup(movedGroup, false)
  }

  function pointerUp(event: PointerEvent<HTMLDivElement>, piece: PuzzlePiece) {
    const drag = dragging.current
    if (!drag || drag.id !== piece.id) return
    const currentPiece = { ...piece, x: drag.x, y: drag.y }
    const connected = connectPiece(piece.id, currentPiece)
    if (!connected) sendGroup([currentPiece], true)
    event.currentTarget.releasePointerCapture(event.pointerId)
    dragging.current = null
    setSelectedId(null)
  }

  if (!room) return (
    <section className="lobby">
      <h1>Puzzle multiplayer</h1>
      <div className="tabs"><button className={mode === 'create' ? 'active' : ''} onClick={() => setMode('create')}>Criar sala</button><button className={mode === 'join' ? 'active' : ''} onClick={() => setMode('join')}>Entrar em sala</button></div>
      {mode === 'create' && <label>Imagem<input type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseImage} /></label>}
      {mode === 'create' && <div className="dimensions"><label>Colunas<input type="number" min="2" value={pieceColumns} onChange={event => setPieceColumns(Number(event.target.value))} /></label><label>Linhas<input type="number" min="2" value={pieceRows} onChange={event => setPieceRows(Number(event.target.value))} /></label></div>}
      {mode === 'join' && <label>Codigo da sala<input value={roomId} onChange={event => setRoomId(event.target.value.toUpperCase())} /></label>}
      <label>Senha<input type="password" value={password} onChange={event => setPassword(event.target.value)} /></label>
      {image && mode === 'create' && <img className="preview" src={image} alt="Pre-visualizacao" />}
      {error && <p className="error">{error}</p>}
      <button disabled={connecting} onClick={mode === 'create' ? createRoom : joinRoom}>{connecting ? 'Conectando...' : mode === 'create' ? 'Criar sala' : 'Entrar'}</button>
    </section>
  )

  return (
    <div className="game">
      <div className="toolbar"><span>Sala: <strong>{room.id}</strong> · {pieces.length} pecas</span><button onClick={() => setShowLabels(value => !value)}>{showLabels ? 'Esconder numeros' : 'Mostrar numeros'}</button></div>
      <main ref={boardRef} className="board" onPointerDown={() => setSelectedId(null)}>
        {pieces.map(piece => <Piece key={piece.id} piece={piece} selected={selectedId === piece.id} showLabel={showLabels} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} />)}
      </main>
    </div>
  )
}
