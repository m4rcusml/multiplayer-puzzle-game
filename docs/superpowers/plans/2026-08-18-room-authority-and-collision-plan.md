# Autoridade da sala e colisões — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o servidor controlar posse, colisões, host e visibilidade dos números em salas multiplayer.

**Architecture:** Extrair a geometria para funções puras testáveis. O backend manterá host, participantes e bloqueios por grupo, validará cada movimento e emitirá apenas estado aceito. O cliente solicitará posse antes do arraste e renderizará controles conforme a autoridade recebida.

**Tech Stack:** TypeScript, Node `node:test`, Socket.IO, React, Vite.

**Spec:** `docs/superpowers/specs/2026-08-18-room-authority-and-collision-design.md`

## Global Constraints

- `showLabels` começa como `false`.
- A senha não aparece no objeto público da sala.
- Somente o host pode alterar a visibilidade dos números.
- Movimentos sem posse válida são ignorados pelo servidor.
- Peças conectadas usam offsets de `targetX`/`targetY` e não podem se sobrepor.

### Task 1: Extrair e testar regras geométricas

**Files:**
- Create: `src/room-geometry.ts`
- Create: `tests/room-geometry.test.ts`
- Modify: `index.ts` para usar as funções geométricas

**Interfaces:**
- `type GeometryPiece = { id: string; x: number; y: number; targetX: number; targetY: number; columns: number; rows: number; groupId?: string }`
- `pieceSize(piece): { width: number; height: number }`
- `groupPieces(pieces, groupId): GeometryPiece[]`
- `clampGroupDelta(pieces, movingGroupId, dx, dy): { dx: number; dy: number }`
- `overlapsOtherGroup(pieces, movingGroupId, dx, dy): boolean`
- `snapGroupToNeighbor(pieces, pieceId): GeometryPiece[] | undefined`

- [ ] **Step 1: Write failing tests** for exact piece dimensions, edge clamping, collision rejection and adjacent snapping.
- [ ] **Step 2: Run `npx tsx --test tests/room-geometry.test.ts`** and confirm failure because the module/functions are missing.
- [ ] **Step 3: Implement the pure geometry functions** using rectangle bounds centered at `x`/`y`, with `0..1` board bounds and strict group exclusion.
- [ ] **Step 4: Run the geometry test again** and confirm all cases pass.
- [ ] **Step 5: Commit** with `git add src/room-geometry.ts tests/room-geometry.test.ts index.ts; git commit -m "feat: add authoritative room geometry"`.

### Task 2: Add room host, public payload and exclusive locks

**Files:**
- Modify: `index.ts`
- Create: `tests/room-authority.test.ts`

**Interfaces:**
- `Room` gains `hostId: string`, `showLabels: boolean`, and `locks: Map<string, string>`.
- `publicRoom(room): PublicRoom` excludes `password` and `locks`.
- `roomSnapshot(room, socketId): { room: PublicRoom; isHost: boolean; roomPassword?: string }`.
- Events: `claim_group`, `release_group`, `host_changed`, `labels_visibility_changed`.

- [ ] **Step 1: Write failing authority tests** covering first creator as host, public payload without password, second socket being denied a locked group, and lock release.
- [ ] **Step 2: Run the authority tests** and confirm they fail against the current protocol.
- [ ] **Step 3: Add host and lock state** when creating a room, set creator as host, and return snapshots instead of the raw room.
- [ ] **Step 4: Implement `claim_group`/`release_group`** so only one socket owns a group lock and movement handlers require ownership.
- [ ] **Step 5: Implement disconnect handling** to release locks and transfer `hostId` to the first remaining room member, sending the password only to the new host.
- [ ] **Step 6: Implement host-only `set_labels_visibility`** and broadcast the resulting boolean to every socket in the room.
- [ ] **Step 7: Run the authority tests** and confirm all pass.
- [ ] **Step 8: Commit** with `git add index.ts tests/room-authority.test.ts; git commit -m "feat: enforce room authority and ownership"`.

### Task 3: Integrate authoritative movement and collision handling

**Files:**
- Modify: `index.ts`
- Modify: `client/src/RoomGame.tsx`

**Interfaces:**
- Client emits `claim_group({ roomId, groupId })` with acknowledgement `{ ok: boolean; error?: string }`.
- Client emits `release_group({ roomId, groupId })` on pointer release/cancel.
- Client movement payloads include `groupId`; server broadcasts accepted `group_moved` positions.

- [ ] **Step 1: Add an integration regression test** showing that an unowned move is ignored and a claimed move is clamped/rejected when it intersects another group.
- [ ] **Step 2: Run the regression test** and confirm it fails before the protocol changes.
- [ ] **Step 3: Apply `clampGroupDelta` and collision checks** in `move_group`; broadcast the authoritative positions back to the sender and peers.
- [ ] **Step 4: Make `pointerDown` claim the complete current group** before setting `dragging`; if denied, show a short error and do not capture the pointer.
- [ ] **Step 5: Use the server-accepted positions for local state** and release the group on pointer up, pointer cancel and unmount.
- [ ] **Step 6: Run backend/frontend builds and the integration regression test**.
- [ ] **Step 7: Commit** with `git add index.ts client/src/RoomGame.tsx tests; git commit -m "feat: synchronize collision-safe group movement"`.

### Task 4: Add host controls, hidden labels and leave flow

**Files:**
- Modify: `client/src/RoomGame.tsx`
- Modify: `client/src/components/piece/index.tsx`
- Modify: `client/src/simple.css`

**Interfaces:**
- `RoomResponse` includes `isHost`, optional `roomPassword`, and public room data.
- `RoomGame` subscribes to `host_changed` and `labels_visibility_changed`.

- [ ] **Step 1: Add UI tests or pure state tests** for labels defaulting to hidden, non-host controls being absent, and leave returning to the lobby.
- [ ] **Step 2: Run the UI/state tests** and confirm they fail against the current `showLabels = true` behavior.
- [ ] **Step 3: Initialize `showLabels` from the room snapshot**, render the toggle only for the host, and emit host-only visibility changes.
- [ ] **Step 4: Render the host-only password field** with a local show/hide toggle and no password value for participants.
- [ ] **Step 5: Add “Sair da sala”** to release any active group, disconnect, clear room/pieces and return to the lobby.
- [ ] **Step 6: Handle host transfer** by updating `isHost`, receiving the password only on the promoted client, and showing/hiding host controls immediately.
- [ ] **Step 7: Run frontend build and UI/state tests**.
- [ ] **Step 8: Commit** with `git add client/src/RoomGame.tsx client/src/components/piece/index.tsx client/src/simple.css tests; git commit -m "feat: add host controls and room exit"`.

### Task 5: Full verification and cleanup

**Files:**
- Modify: `package.json` to expose the test command if needed
- Modify: `client/package.json` only if the frontend test command is added

- [ ] **Step 1: Run `npx tsx --test tests/*.test.ts`** and verify zero failures.
- [ ] **Step 2: Run `npm run build` from the repository root** and verify exit code 0.
- [ ] **Step 3: Run `npm run build` from `client`** and verify exit code 0.
- [ ] **Step 4: Search for stale direct movement/visibility assumptions** such as `showLabels = true`, raw room password responses, and movement without a claim.
- [ ] **Step 5: Inspect `git diff` and remove only generated build artifacts before handoff.**
