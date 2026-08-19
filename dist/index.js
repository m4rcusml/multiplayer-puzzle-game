import express from 'express';
import { createServer } from 'http';
import { randomBytes } from 'crypto';
import { Server } from 'socket.io';
import { clampGroupDelta } from './src/room-geometry.js';
const app = express();
const server = createServer(app);
const clientOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    process.env.CLIENT_ORIGIN ?? 'https://tonetic-semiprovincially-raeann.ngrok-free.dev',
];
const io = new Server(server, {
    cors: { origin: clientOrigins },
    maxHttpBufferSize: 8 * 1024 * 1024,
});
const rooms = new Map();
export function publicRoom(room) {
    return { id: room.id, image: room.image, columns: room.columns, rows: room.rows, pieces: room.pieces };
}
export function roomSnapshot(room, socketId) {
    const snapshot = { room: publicRoom(room), isHost: room.hostId === socketId, showLabels: room.showLabels };
    if (snapshot.isHost)
        snapshot.roomPassword = room.password;
    return snapshot;
}
export function claimGroup(room, groupId, socketId) {
    const owner = room.locks.get(groupId);
    if (owner && owner !== socketId)
        return { ok: false, error: 'Grupo em uso.' };
    room.locks.set(groupId, socketId);
    return { ok: true };
}
export function releaseGroup(room, groupId, socketId) {
    if (room.locks.get(groupId) !== socketId)
        return false;
    room.locks.delete(groupId);
    return true;
}
export function assignHostIfMissing(room, memberIds, nextHostId) {
    if (new Set(memberIds).has(room.hostId))
        return false;
    room.hostId = nextHostId;
    return true;
}
export function createRoom(request, hostId) {
    const columns = request.columns ?? 2;
    const rows = request.rows ?? 2;
    const room = { id: request.id ?? createRoomId(), password: request.password ?? '', image: request.image ?? '', columns, rows, pieces: createPieces(columns, rows), hostId, showLabels: false, locks: new Map() };
    rooms.set(room.id, room);
    return room;
}
function createRoomId() {
    return randomBytes(3).toString('hex').toUpperCase();
}
function secureRandomUnit() {
    return randomBytes(4).readUInt32BE(0) / 0x100000000;
}
export function createPieces(columns, rows, random = secureRandomUnit) {
    const count = columns * rows;
    const scatterSlots = Array.from({ length: count }, (_, index) => index);
    for (let index = scatterSlots.length - 1; index > 0; index--) {
        const randomIndex = Math.floor(random() * (index + 1));
        [scatterSlots[index], scatterSlots[randomIndex]] = [scatterSlots[randomIndex], scatterSlots[index]];
    }
    const pieceHeight = 0.7 / rows;
    const freeVerticalSpace = 1 - pieceHeight * rows;
    const verticalCenters = Array.from({ length: columns }, () => {
        const weights = Array.from({ length: rows + 1 }, () => -Math.log(Math.max(Number.EPSILON, random())));
        const totalWeight = weights.reduce((total, weight) => total + weight, 0);
        const gaps = weights.map(weight => (weight / totalWeight) * freeVerticalSpace);
        let cursor = gaps[0];
        return Array.from({ length: rows }, (_, row) => {
            const center = cursor + pieceHeight / 2;
            cursor += pieceHeight + gaps[row + 1];
            return center;
        });
    });
    return Array.from({ length: count }, (_, index) => {
        const row = Math.floor(index / columns);
        const column = index % columns;
        const scatterSlot = scatterSlots[index];
        const scatterColumn = scatterSlot % columns;
        const scatterRow = Math.floor(scatterSlot / columns);
        const horizontalSlack = 0.3 / columns;
        const jitterX = (random() * 2 - 1) * horizontalSlack * 0.45;
        return {
            id: `piece-${index + 1}`,
            row,
            column,
            x: (scatterColumn + 0.5) / columns + jitterX,
            y: verticalCenters[scatterColumn][scatterRow],
            targetX: 0.15 + ((column + 0.5) / columns) * 0.7,
            targetY: 0.15 + ((row + 0.5) / rows) * 0.7,
            columns,
            rows,
            locked: false,
        };
    });
}
export function applyGroupMove(room, data, socketId) {
    if (!data.pieces?.length)
        return { ok: false, pieces: [] };
    const sourceGroupId = typeof data.sourceGroupId === 'string' ? data.sourceGroupId : undefined;
    if (!sourceGroupId || room.locks.get(sourceGroupId) !== socketId)
        return { ok: false, pieces: [] };
    const movingPieces = room.pieces.filter(piece => piece.groupId === sourceGroupId || (piece.groupId === undefined && piece.id === sourceGroupId));
    const movingIds = new Set(movingPieces.map(piece => piece.id));
    const anchorUpdate = data.pieces.find(update => typeof update.id === 'string' && movingIds.has(update.id) && Number.isFinite(update.x) && Number.isFinite(update.y));
    const anchorPiece = anchorUpdate ? room.pieces.find(piece => piece.id === anchorUpdate.id) : undefined;
    if (!anchorUpdate || !anchorPiece)
        return { ok: false, pieces: movingPieces };
    const updateById = new Map(data.pieces.map(update => [update.id, update]));
    const destinationIds = new Set(movingPieces.map(piece => updateById.get(piece.id)?.groupId).filter((groupId) => typeof groupId === 'string'));
    if (destinationIds.size > 1)
        return { ok: false, pieces: movingPieces };
    const destinationGroupId = destinationIds.values().next().value;
    if (destinationGroupId && destinationGroupId !== sourceGroupId) {
        const destinationPieces = room.pieces.filter(piece => piece.groupId === destinationGroupId || (piece.groupId === undefined && piece.id === destinationGroupId));
        const destinationOwner = room.locks.get(destinationGroupId);
        if (destinationPieces.length === 0 || (destinationOwner && destinationOwner !== socketId))
            return { ok: false, pieces: movingPieces };
    }
    const requestedDx = anchorUpdate.x - anchorPiece.x;
    const requestedDy = anchorUpdate.y - anchorPiece.y;
    const delta = clampGroupDelta(room.pieces, sourceGroupId, requestedDx, requestedDy);
    if (destinationGroupId && destinationGroupId !== sourceGroupId && (Math.abs(delta.dx - requestedDx) > 1e-9 || Math.abs(delta.dy - requestedDy) > 1e-9)) {
        return { ok: false, pieces: movingPieces };
    }
    for (const piece of movingPieces) {
        const update = updateById.get(piece.id);
        piece.x += delta.dx;
        piece.y += delta.dy;
        if (!update)
            continue;
        piece.locked = update.locked === true;
        if (typeof update.groupId === 'string')
            piece.groupId = update.groupId;
    }
    return {
        ok: true,
        pieces: destinationGroupId && destinationGroupId !== sourceGroupId
            ? room.pieces.filter(piece => piece.groupId === destinationGroupId || (piece.groupId === undefined && piece.id === destinationGroupId))
            : movingPieces,
    };
}
function validImage(image) {
    return typeof image === 'string' && /^data:image\/(png|jpeg|jpg|webp);base64,/.test(image) && image.length <= 7_000_000;
}
function leaveRoom(socket) {
    const roomId = [...socket.rooms].find(room => room !== socket.id);
    if (roomId)
        socket.leave(roomId);
}
io.on('connection', socket => {
    socket.on('create_room', (request, done) => {
        if (!request.password || request.password.length > 50)
            return done({ ok: false, error: 'A senha é obrigatória.' });
        if (!Number.isInteger(request.columns) || !Number.isInteger(request.rows) || request.columns < 2 || request.rows < 2) {
            return done({ ok: false, error: 'A quantidade deve estar entre 4 e 100 peças.' });
        }
        if (!validImage(request.image))
            return done({ ok: false, error: 'Envie uma imagem PNG, JPG ou WEBP.' });
        const columns = request.columns;
        const rows = request.rows;
        const image = request.image;
        let id = createRoomId();
        while (rooms.has(id))
            id = createRoomId();
        const room = createRoom({ id, password: request.password, image, columns, rows }, socket.id);
        leaveRoom(socket);
        socket.join(id);
        done({ ok: true, ...roomSnapshot(room, socket.id) });
    });
    socket.on('join_room', (request, done) => {
        const room = request.roomId ? rooms.get(request.roomId.toUpperCase()) : undefined;
        if (!room || room.password !== request.password)
            return done({ ok: false, error: 'Sala ou senha inválida.' });
        leaveRoom(socket);
        assignHostIfMissing(room, io.sockets.adapter.rooms.get(room.id) ?? [], socket.id);
        socket.join(room.id);
        done({ ok: true, ...roomSnapshot(room, socket.id) });
    });
    socket.on('claim_group', (data, done) => {
        if (!data.roomId || !data.groupId || !socket.rooms.has(data.roomId))
            return done({ ok: false, error: 'Sala inválida.' });
        const room = rooms.get(data.roomId);
        if (!room)
            return done({ ok: false, error: 'Sala inválida.' });
        done(claimGroup(room, data.groupId, socket.id));
    });
    socket.on('release_group', (data) => {
        if (!data.roomId || !data.groupId || !socket.rooms.has(data.roomId))
            return;
        const room = rooms.get(data.roomId);
        if (room)
            releaseGroup(room, data.groupId, socket.id);
    });
    socket.on('set_labels_visibility', (data) => {
        if (!data.roomId || typeof data.showLabels !== 'boolean' || !socket.rooms.has(data.roomId))
            return;
        const room = rooms.get(data.roomId);
        if (!room || room.hostId !== socket.id)
            return;
        room.showLabels = data.showLabels;
        io.to(room.id).emit('labels_visibility_changed', { showLabels: room.showLabels });
    });
    socket.on('move_group', (data) => {
        if (!data.roomId || !socket.rooms.has(data.roomId) || !data.pieces?.length)
            return;
        const room = rooms.get(data.roomId);
        if (!room)
            return;
        const result = applyGroupMove(room, data, socket.id);
        if (!result.ok) {
            socket.emit('group_moved', room.pieces);
            return;
        }
        if (result.pieces.length > 0)
            io.to(room.id).emit('group_moved', result.pieces);
    });
    socket.on('disconnecting', () => {
        const roomId = [...socket.rooms].find(room => room !== socket.id);
        if (!roomId)
            return;
        const room = rooms.get(roomId);
        if (!room)
            return;
        for (const [groupId, owner] of room.locks)
            if (owner === socket.id)
                room.locks.delete(groupId);
        if (room.hostId !== socket.id)
            return;
        const members = [...(io.sockets.adapter.rooms.get(room.id) ?? [])].filter(id => id !== socket.id);
        const nextHost = members[0];
        if (!nextHost)
            return;
        room.hostId = nextHost;
        io.to(nextHost).emit('host_changed', { isHost: true, hostId: nextHost, roomPassword: room.password });
        for (const member of members)
            if (member !== nextHost)
                io.to(member).emit('host_changed', { isHost: false, hostId: nextHost });
    });
});
if (!process.env.NODE_TEST_CONTEXT)
    server.listen(3000, () => console.log('Servidor rodando na porta 3000'));
//# sourceMappingURL=index.js.map