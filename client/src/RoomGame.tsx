import { useRef, useState, type ChangeEvent, type PointerEvent } from 'react'
import io, { type Socket } from 'socket.io-client'
import { Piece, type PuzzlePiece } from './components/piece'
import { socketEndpoint } from './socket'
import { clampGroupDelta, type GeometryPiece } from '../../src/room-geometry'

type ServerPiece = Omit<PuzzlePiece, 'image' | 'columns' | 'rows' | 'color'> & { row: number; column: number }
type Room = { id: string; image: string; columns: number; rows: number; pieces: ServerPiece[] }
type Response = { ok: boolean; error?: string; room?: Room }
type DragState = {
  id: string
  groupId: string
  pointerId: number
  target: HTMLDivElement
  offsetX: number
  offsetY: number
  x: number
  y: number
  lastClientX: number
  lastClientY: number
  authorized: boolean
}

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
  const [showLabels, setShowLabels] = useState(false)
  const [isHost, setIsHost] = useState(false)
  const [roomPassword, setRoomPassword] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const boardRef = useRef<HTMLElement>(null)
  const dragging = useRef<DragState | null>(null)
  const lastSentAt = useRef(0)
  const pendingSend = useRef<{ group: PuzzlePiece[]; sourceGroupId: string } | null>(null)
  const sendTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function openRoom(response: Response, nextSocket: Socket) {
    setConnecting(false)
    if (!response.ok || !response.room) {
      setError(response.error || 'Nao foi possivel abrir a sala.')
      nextSocket.disconnect()
      return
    }
    nextSocket.on('group_moved', (movedPieces: ServerPiece[]) => {
      const movedById = new Map(movedPieces.map(piece => [piece.id, piece]))
      setPieces(current => current.map(item => {
        const moved = movedById.get(item.id)
        return moved ? { ...item, ...moved, groupId: moved.groupId } : item
      }))
    })
    nextSocket.on('labels_visibility_changed', ({ showLabels }: { showLabels: boolean }) => setShowLabels(showLabels))
    nextSocket.on('host_changed', (data: { isHost: boolean; roomPassword?: string }) => {
      setIsHost(data.isHost)
      if (data.isHost && data.roomPassword) setRoomPassword(data.roomPassword)
    })
    setSocket(nextSocket)
    setRoom(response.room)
    setPieces(addImageData(response.room))
    const roomResponse = response as Response & { isHost?: boolean; roomPassword?: string; showLabels?: boolean }
    setIsHost(Boolean(roomResponse.isHost))
    setRoomPassword(roomResponse.roomPassword ?? '')
    setShowLabels(Boolean(roomResponse.showLabels))
    setError('')
  }

  function createRoom() {
    if (!image) return setError('Escolha uma imagem primeiro.')
    const nextSocket = io(socketEndpoint())
    setConnecting(true)
    nextSocket.once('connect_error', () => {
      setConnecting(false)
      setError('Nao foi possivel conectar ao servidor.')
      nextSocket.disconnect()
    })
    nextSocket.emit('create_room', { password, columns: pieceColumns, rows: pieceRows, image }, (response: Response) => openRoom(response, nextSocket))
  }

  function joinRoom() {
    const nextSocket = io(socketEndpoint())
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

  function sendGroup(group: PuzzlePiece[], immediate: boolean, sourceGroupId: string) {
    const emit = (nextGroup: PuzzlePiece[], nextSourceGroupId: string) => {
      lastSentAt.current = Date.now()
      socket?.emit('move_group', {
        roomId: room?.id,
        sourceGroupId: nextSourceGroupId,
        pieces: nextGroup.map(piece => ({ id: piece.id, x: piece.x, y: piece.y, locked: piece.locked, groupId: piece.groupId })),
      })
    }

    if (immediate) {
      if (sendTimer.current) clearTimeout(sendTimer.current)
      sendTimer.current = null
      pendingSend.current = null
      emit(group, sourceGroupId)
      return
    }

    if (Date.now() - lastSentAt.current >= 33) {
      if (sendTimer.current) clearTimeout(sendTimer.current)
      sendTimer.current = null
      pendingSend.current = null
      emit(group, sourceGroupId)
      return
    }

    pendingSend.current = { group, sourceGroupId }
    if (!sendTimer.current) {
      sendTimer.current = setTimeout(() => {
        sendTimer.current = null
        if (pendingSend.current) {
          emit(pendingSend.current.group, pendingSend.current.sourceGroupId)
          pendingSend.current = null
        }
      }, 33)
    }
  }

  function moveGroup(id: string, dx: number, dy: number): PuzzlePiece[] {
    const piece = pieces.find(item => item.id === id)
    if (!piece) return []
    const groupId = piece.groupId ?? piece.id
    const geometryPieces = pieces as GeometryPiece[]
    const clamped = clampGroupDelta(geometryPieces, groupId, dx, dy)
    const changed = pieces.map(item => item.groupId === groupId || item.id === groupId || item.id === id
      ? { ...item, x: item.x + clamped.dx, y: item.y + clamped.dy }
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
    const clampedSnap = clampGroupDelta(pieces as GeometryPiece[], movingGroup, deltaX, deltaY)
    if (Math.abs(clampedSnap.dx - deltaX) > 1e-9 || Math.abs(clampedSnap.dy - deltaY) > 1e-9) return undefined
    const connected = pieces.map(item => {
      const inMovingGroup = item.groupId === movingGroup || item.id === movingGroup || item.id === id
      const inOtherGroup = item.groupId === otherGroup || item.id === otherGroup
      if (!inMovingGroup && !inOtherGroup) return item
      if (inMovingGroup) return { ...item, x: item.x + deltaX, y: item.y + deltaY, groupId }
      return { ...item, groupId }
    })
    setPieces(connected)
    sendGroup(connected.filter(item => item.groupId === groupId), true, movingGroup)
    return connected
  }

  function pointerDown(event: PointerEvent<HTMLDivElement>, piece: PuzzlePiece) {
    if (!boardRef.current || !socket || !room || dragging.current) return
    const board = boardRef.current.getBoundingClientRect()
    event.stopPropagation()
    setSelectedId(piece.id)
    const groupId = piece.groupId ?? piece.id
    const target = event.currentTarget
    const pointerId = event.pointerId
    const clientX = event.clientX
    const clientY = event.clientY
    target.setPointerCapture(pointerId)
    dragging.current = {
      id: piece.id,
      groupId,
      pointerId,
      target,
      offsetX: clientX - board.left - piece.x * board.width,
      offsetY: clientY - board.top - piece.y * board.height,
      x: piece.x,
      y: piece.y,
      lastClientX: clientX,
      lastClientY: clientY,
      authorized: false,
    }
    socket.emit('claim_group', { roomId: room.id, groupId }, (response: { ok: boolean; error?: string }) => {
      const drag = dragging.current
      if (!drag || drag.id !== piece.id || drag.pointerId !== pointerId) {
        if (response.ok) socket.emit('release_group', { roomId: room.id, groupId })
        return
      }
      if (!response.ok) {
        setError(response.error ?? 'Essa peça está sendo movida por outra pessoa.')
        dragging.current = null
        if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId)
        setSelectedId(null)
        return
      }
      drag.authorized = true
      setError('')
      if (drag.lastClientX !== clientX || drag.lastClientY !== clientY) moveDragTo(drag, drag.lastClientX, drag.lastClientY)
    })
  }

  function moveDragTo(drag: DragState, clientX: number, clientY: number) {
    const board = boardRef.current?.getBoundingClientRect()
    if (!board) return
    const x = Math.max(0, Math.min(1, (clientX - board.left - drag.offsetX) / board.width))
    const y = Math.max(0, Math.min(1, (clientY - board.top - drag.offsetY) / board.height))
    const movedGroup = moveGroup(drag.id, x - drag.x, y - drag.y)
    const movedPiece = movedGroup.find(item => item.id === drag.id)
    if (movedPiece) {
      drag.x = movedPiece.x
      drag.y = movedPiece.y
    }
    sendGroup(movedGroup, false, drag.groupId)
  }

  function pointerMove(event: PointerEvent<HTMLDivElement>, piece: PuzzlePiece) {
    const drag = dragging.current
    if (!drag || drag.id !== piece.id || drag.pointerId !== event.pointerId) return
    drag.lastClientX = event.clientX
    drag.lastClientY = event.clientY
    if (drag.authorized) moveDragTo(drag, event.clientX, event.clientY)
  }

  function finishPointer(event: PointerEvent<HTMLDivElement>, piece: PuzzlePiece, connect: boolean) {
    const drag = dragging.current
    if (!drag || drag.id !== piece.id || drag.pointerId !== event.pointerId) return
    dragging.current = null
    setSelectedId(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (!drag.authorized) return

    const renderedPiece = pieces.find(item => item.id === piece.id) ?? piece
    const currentPiece = { ...renderedPiece, x: drag.x, y: drag.y }
    const connected = connect ? connectPiece(piece.id, currentPiece) : undefined
    if (!connected) {
      const correctionX = drag.x - renderedPiece.x
      const correctionY = drag.y - renderedPiece.y
      const currentGroup = pieces
        .filter(item => item.groupId === drag.groupId || (item.groupId === undefined && item.id === drag.groupId))
        .map(item => ({ ...item, x: item.x + correctionX, y: item.y + correctionY }))
      sendGroup(currentGroup, true, drag.groupId)
    }
    socket?.emit('release_group', { roomId: room?.id, groupId: drag.groupId })
  }

  function pointerUp(event: PointerEvent<HTMLDivElement>, piece: PuzzlePiece) {
    finishPointer(event, piece, true)
  }

  function pointerCancel(event: PointerEvent<HTMLDivElement>, piece: PuzzlePiece) {
    finishPointer(event, piece, false)
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
      <div className="toolbar"><span>Sala: <strong>{room.id}</strong> · {pieces.length} peças</span><div className="toolbar-actions">{isHost && <><button onClick={() => socket?.emit('set_labels_visibility', { roomId: room.id, showLabels: !showLabels })}>{showLabels ? 'Esconder números' : 'Mostrar números'}</button><input readOnly type={passwordVisible ? 'text' : 'password'} value={roomPassword} aria-label="Senha da sala" /><button onClick={() => setPasswordVisible(value => !value)}>{passwordVisible ? 'Ocultar senha' : 'Mostrar senha'}</button></>}<button onClick={() => { socket?.disconnect(); setSocket(null); setRoom(null); setPieces([]); setSelectedId(null); setRoomPassword(''); setIsHost(false) }}>Sair da sala</button></div></div>
      {error && <p className="game-error" role="alert">{error}</p>}
      <main ref={boardRef} className="board" onPointerDown={() => setSelectedId(null)}>
        {pieces.map(piece => <Piece key={piece.id} piece={piece} selected={selectedId === piece.id} showLabel={showLabels} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerCancel} />)}
      </main>
    </div>
  )
}
