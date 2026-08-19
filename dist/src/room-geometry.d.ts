export type GeometryPiece = {
    id: string;
    x: number;
    y: number;
    targetX: number;
    targetY: number;
    columns: number;
    rows: number;
    groupId?: string;
};
export declare function pieceSize(piece: GeometryPiece): {
    width: number;
    height: number;
};
export declare function groupPieces(pieces: GeometryPiece[], groupId: string): GeometryPiece[];
export declare function clampGroupDelta(pieces: GeometryPiece[], movingGroupId: string, dx: number, dy: number): {
    dx: number;
    dy: number;
};
export declare function overlapsOtherGroup(pieces: GeometryPiece[], movingGroupId: string, dx: number, dy: number): boolean;
export declare function snapGroupToNeighbor(pieces: GeometryPiece[], pieceId: string): GeometryPiece[] | undefined;
//# sourceMappingURL=room-geometry.d.ts.map