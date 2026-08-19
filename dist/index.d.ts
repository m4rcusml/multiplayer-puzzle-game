import { type GeometryPiece } from './src/room-geometry.js';
type Piece = GeometryPiece & {
    row: number;
    column: number;
    locked: boolean;
};
type Room = {
    id: string;
    password: string;
    image: string;
    columns: number;
    rows: number;
    pieces: Piece[];
    hostId: string;
    showLabels: boolean;
    locks: Map<string, string>;
};
export type PublicRoom = Omit<Room, 'password' | 'locks' | 'hostId' | 'showLabels'>;
type RoomRequest = {
    roomId?: string;
    password?: string;
    columns?: number;
    rows?: number;
    image?: string;
};
type GroupPieceUpdate = {
    id?: string;
    x?: number;
    y?: number;
    locked?: boolean;
    groupId?: string;
};
type GroupMoveData = {
    pieces?: GroupPieceUpdate[];
    sourceGroupId?: string;
};
export declare function publicRoom(room: Room): PublicRoom;
export declare function roomSnapshot(room: Room, socketId: string): {
    room: PublicRoom;
    isHost: boolean;
    showLabels: boolean;
    roomPassword?: string;
};
export declare function claimGroup(room: Room, groupId: string, socketId: string): {
    ok: true;
} | {
    ok: false;
    error: string;
};
export declare function releaseGroup(room: Room, groupId: string, socketId: string): boolean;
export declare function assignHostIfMissing(room: Room, memberIds: Iterable<string>, nextHostId: string): boolean;
type RoomCreation = Omit<RoomRequest, 'roomId'> & {
    id?: string;
};
export declare function createRoom(request: RoomCreation, hostId: string): Room;
declare function secureRandomUnit(): number;
export declare function createPieces(columns: number, rows: number, random?: typeof secureRandomUnit): Piece[];
export declare function applyGroupMove(room: Room, data: GroupMoveData, socketId: string): {
    ok: boolean;
    pieces: Piece[];
};
export {};
//# sourceMappingURL=index.d.ts.map