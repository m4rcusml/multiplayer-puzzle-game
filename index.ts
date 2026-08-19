import express from 'express'
import { createServer } from 'http'
import { randomBytes } from 'crypto'
import { Server, type Socket } from 'socket.io'

type Piece = {
  id: string
  x: number
  y: number
  targetX: number
  targetY: number
  row: number
  column: number
  groupId?: string
  locked: boolean
}

type Room = {
  id: string
  password: string
  image: string
  columns: number
  rows: number
  pieces: Piece[]
}

type RoomRequest = {
  roomId?: string
  password?: string
  columns?: number
  rows?: number
  image?: string
}

type GroupPieceUpdate = {
  id?: string
  x?: number
  y?: number
  locked?: boolean
  groupId?: string
}

const app = express()
const server = createServer(app)
const io = new Server(server, {
  cors: { origin: 'http://localhost:5173' },
  maxHttpBufferSize: 8 * 1024 * 1024,
})
const rooms = new Map<string, Room>()

function createRoomId() {
  return randomBytes(3).toString('hex').toUpperCase()
}

function createPieces(columns: number, rows: number): Piece[] {
  const count = columns * rows

  return Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / columns)
    const column = index % columns
    return {
      id: `piece-${index + 1}`,
      row,
      column,
      x: 0.08 + ((index * 0.37) % 0.84),
      y: 0.08 + ((index * 0.61) % 0.84),
      targetX: 0.15 + ((column + 0.5) / columns) * 0.7,
      targetY: 0.15 + ((row + 0.5) / rows) * 0.7,
      locked: false,
    }
  })
}

function validImage(image: unknown): image is string {
  return typeof image === 'string' && /^data:image\/(png|jpeg|jpg|webp);base64,/.test(image) && image.length <= 7_000_000
}

function leaveRoom(socket: Socket) {
  const roomId = [...socket.rooms].find(room => room !== socket.id)
  if (roomId) socket.leave(roomId)
}

io.on('connection', socket => {
  socket.on('create_room', (request: RoomRequest, done: (response: object) => void) => {
    if (!request.password || request.password.length > 50) return done({ ok: false, error: 'A senha é obrigatória.' })
    if (!Number.isInteger(request.columns) || !Number.isInteger(request.rows) || request.columns! < 2 || request.rows! < 2) {
      return done({ ok: false, error: 'A quantidade deve estar entre 4 e 100 peças.' })
    }
    if (!validImage(request.image)) return done({ ok: false, error: 'Envie uma imagem PNG, JPG ou WEBP.' })
    const columns = request.columns!
    const rows = request.rows!
    const image = request.image

    let id = createRoomId()
    while (rooms.has(id)) id = createRoomId()
    const room: Room = { id, password: request.password, image, columns, rows, pieces: createPieces(columns, rows) }
    rooms.set(id, room)
    leaveRoom(socket)
    socket.join(id)
    done({ ok: true, room })
  })

  socket.on('join_room', (request: RoomRequest, done: (response: object) => void) => {
    const room = request.roomId ? rooms.get(request.roomId.toUpperCase()) : undefined
    if (!room || room.password !== request.password) return done({ ok: false, error: 'Sala ou senha inválida.' })
    leaveRoom(socket)
    socket.join(room.id)
    done({ ok: true, room })
  })

  socket.on('move_piece', (data: { roomId?: string; pieceId?: string; x?: number; y?: number; locked?: boolean; groupId?: string }) => {
    if (!data.roomId || !socket.rooms.has(data.roomId)) return
    const room = rooms.get(data.roomId)
    if (!room) return
    const piece = room?.pieces.find(item => item.id === data.pieceId)
    if (!piece || !Number.isFinite(data.x) || !Number.isFinite(data.y)) return

    piece.x = Math.max(0, Math.min(1, data.x!))
    piece.y = Math.max(0, Math.min(1, data.y!))
    piece.locked = data.locked === true
    piece.groupId = data.groupId
    socket.to(room.id).emit('piece_moved', piece)
  })

  socket.on('move_group', (data: { roomId?: string; pieces?: GroupPieceUpdate[] }) => {
    if (!data.roomId || !socket.rooms.has(data.roomId) || !Array.isArray(data.pieces)) return
    const room = rooms.get(data.roomId)
    if (!room) return

    const updatedPieces = data.pieces.flatMap(update => {
      const piece = room.pieces.find(item => item.id === update.id)
      if (!piece || !Number.isFinite(update.x) || !Number.isFinite(update.y)) return []

      piece.x = Math.max(0, Math.min(1, update.x!))
      piece.y = Math.max(0, Math.min(1, update.y!))
      piece.locked = update.locked === true
      piece.groupId = update.groupId
      return [piece]
    })

    if (updatedPieces.length > 0) socket.to(room.id).emit('group_moved', updatedPieces)
  })
})

server.listen(3000, () => console.log('Servidor rodando na porta 3000'))
