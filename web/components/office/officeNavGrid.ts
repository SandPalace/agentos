// Pure TypeScript — no React/Three.js imports
// A* 8-directional pathfinding for the office floor

export interface AABB2D {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

const SQRT2 = Math.SQRT2;

interface Node {
  col: number;
  row: number;
  g: number;
  f: number;
  parent: Node | null;
}

export class OfficeNavGrid {
  private grid: boolean[][]; // true = walkable
  private width: number;
  private height: number;
  private cellSize: number;
  private originX: number;
  private originZ: number;

  constructor(
    floorMinX: number,
    floorMinZ: number,
    floorMaxX: number,
    floorMaxZ: number,
    cellSize = 0.5,
  ) {
    this.cellSize = cellSize;
    this.originX = floorMinX;
    this.originZ = floorMinZ;

    this.width = Math.ceil((floorMaxX - floorMinX) / cellSize);
    this.height = Math.ceil((floorMaxZ - floorMinZ) / cellSize);

    // Initialize all cells as walkable
    this.grid = Array.from({ length: this.height }, () =>
      new Array(this.width).fill(true),
    );
  }

  /** Force a world-space circle as walkable (clears obstacle marks) */
  clearRadius(worldX: number, worldZ: number, radius: number): void {
    const cellRadius = Math.ceil(radius / this.cellSize);
    const [cc, cr] = this.worldToCell(worldX, worldZ);
    for (let dr = -cellRadius; dr <= cellRadius; dr++) {
      for (let dc = -cellRadius; dc <= cellRadius; dc++) {
        const nc = cc + dc;
        const nr = cr + dr;
        if (nc >= 0 && nc < this.width && nr >= 0 && nr < this.height) {
          // Only clear within circular radius
          const dist = Math.sqrt(dc * dc + dr * dr) * this.cellSize;
          if (dist <= radius) {
            this.grid[nr][nc] = true;
          }
        }
      }
    }
  }

  /** Mark cells overlapping obstacles + buffer as blocked */
  rasterize(obstacles: AABB2D[], buffer = 0.3): void {
    for (const obs of obstacles) {
      const minX = obs.minX - buffer;
      const maxX = obs.maxX + buffer;
      const minZ = obs.minZ - buffer;
      const maxZ = obs.maxZ + buffer;

      const colMin = Math.max(
        0,
        Math.floor((minX - this.originX) / this.cellSize),
      );
      const colMax = Math.min(
        this.width - 1,
        Math.ceil((maxX - this.originX) / this.cellSize),
      );
      const rowMin = Math.max(
        0,
        Math.floor((minZ - this.originZ) / this.cellSize),
      );
      const rowMax = Math.min(
        this.height - 1,
        Math.ceil((maxZ - this.originZ) / this.cellSize),
      );

      for (let row = rowMin; row <= rowMax; row++) {
        for (let col = colMin; col <= colMax; col++) {
          this.grid[row][col] = false;
        }
      }
    }
  }

  /** A* 8-directional — returns world coords as [x, 0, z][] */
  findPath(
    startX: number,
    startZ: number,
    endX: number,
    endZ: number,
  ): [number, number, number][] {
    const [sc, sr] = this.worldToCell(startX, startZ);
    const [ec, er] = this.worldToCell(endX, endZ);

    // Clamp to grid bounds
    const startCol = Math.max(0, Math.min(this.width - 1, sc));
    const startRow = Math.max(0, Math.min(this.height - 1, sr));
    const endCol = Math.max(0, Math.min(this.width - 1, ec));
    const endRow = Math.max(0, Math.min(this.height - 1, er));

    // If start or end is blocked, snap to nearest walkable cell (no recursion)
    let sCol = startCol,
      sRow = startRow,
      eCol = endCol,
      eRow = endRow;
    if (!this.grid[sRow]?.[sCol]) {
      const fallback = this.nearestWalkable(sCol, sRow);
      if (!fallback) return [];
      [sCol, sRow] = fallback;
    }
    if (!this.grid[eRow]?.[eCol]) {
      const fallback = this.nearestWalkable(eCol, eRow);
      if (!fallback) return [];
      [eCol, eRow] = fallback;
    }

    const key = (c: number, r: number) => r * this.width + c;
    const heuristic = (c: number, r: number) =>
      Math.max(Math.abs(c - eCol), Math.abs(r - eRow)); // Chebyshev

    const openMap = new Map<number, Node>();
    const closedSet = new Set<number>();

    const startNode: Node = {
      col: sCol,
      row: sRow,
      g: 0,
      f: heuristic(sCol, sRow),
      parent: null,
    };
    openMap.set(key(sCol, sRow), startNode);

    const dirs: [number, number][] = [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];

    while (openMap.size > 0) {
      // Pick node with lowest f
      let current: Node | null = null;
      for (const node of Array.from(openMap.values())) {
        if (!current || node.f < current.f) current = node;
      }
      if (!current) break;

      if (current.col === eCol && current.row === eRow) {
        return this.reconstructPath(current);
      }

      const ck = key(current.col, current.row);
      openMap.delete(ck);
      closedSet.add(ck);

      for (const [dc, dr] of dirs) {
        const nc = current.col + dc;
        const nr = current.row + dr;
        if (nc < 0 || nc >= this.width || nr < 0 || nr >= this.height) continue;
        if (!this.grid[nr][nc]) continue;

        // No corner-cutting: skip diagonal if either cardinal neighbor is blocked
        if (dc !== 0 && dr !== 0) {
          if (!this.grid[current.row][current.col + dc]) continue;
          if (!this.grid[current.row + dr]?.[current.col]) continue;
        }

        const nk = key(nc, nr);
        if (closedSet.has(nk)) continue;

        const isDiag = dc !== 0 && dr !== 0;
        const tentativeG = current.g + (isDiag ? SQRT2 : 1);

        const existing = openMap.get(nk);
        if (!existing || tentativeG < existing.g) {
          const neighbor: Node = {
            col: nc,
            row: nr,
            g: tentativeG,
            f: tentativeG + heuristic(nc, nr),
            parent: current,
          };
          openMap.set(nk, neighbor);
        }
      }
    }

    return []; // No path found
  }

  worldToCell(x: number, z: number): [number, number] {
    const col = Math.floor((x - this.originX) / this.cellSize);
    const row = Math.floor((z - this.originZ) / this.cellSize);
    return [col, row];
  }

  cellToWorld(col: number, row: number): [number, number] {
    const x = this.originX + (col + 0.5) * this.cellSize;
    const z = this.originZ + (row + 0.5) * this.cellSize;
    return [x, z];
  }

  private reconstructPath(node: Node): [number, number, number][] {
    const path: [number, number, number][] = [];
    let current: Node | null = node;
    while (current) {
      const [wx, wz] = this.cellToWorld(current.col, current.row);
      path.unshift([wx, 0, wz]);
      current = current.parent;
    }
    return path;
  }

  private nearestWalkable(col: number, row: number): [number, number] | null {
    for (let radius = 1; radius < 10; radius++) {
      for (let dc = -radius; dc <= radius; dc++) {
        for (let dr = -radius; dr <= radius; dr++) {
          if (Math.abs(dc) !== radius && Math.abs(dr) !== radius) continue;
          const nc = col + dc;
          const nr = row + dr;
          if (
            nc >= 0 &&
            nc < this.width &&
            nr >= 0 &&
            nr < this.height &&
            this.grid[nr][nc]
          ) {
            return [nc, nr];
          }
        }
      }
    }
    return null;
  }

  /** Debug: check if a world position is walkable */
  isWalkable(x: number, z: number): boolean {
    const [col, row] = this.worldToCell(x, z);
    if (col < 0 || col >= this.width || row < 0 || row >= this.height)
      return false;
    return this.grid[row][col];
  }
}

// ─── Shared floor-bounds nav grid factory ────────────────────────────────────
// Floor X: 2–30, Z: -16–19 (from ROOMS in officeLayout.ts)

export const FLOOR_MIN_X = 2;
export const FLOOR_MIN_Z = -16;
export const FLOOR_MAX_X = 30;
export const FLOOR_MAX_Z = 19;
export const NAV_CELL_SIZE = 0.5;

/** Create a grid pre-rasterized with desk/wall obstacle AABBs,
 *  then punch walkable holes at known anchor positions so A* can route to/from them.
 *  @param anchors — world [x, z] positions (desks, chill spots) to force-clear */
export interface FloorBounds { minX: number; minZ: number; maxX: number; maxZ: number }

let _obstacles: AABB2D[] = [];
/** Cajas de los muebles de la oficina activa (sin margen), para la colisión exacta de la persona usuaria. */
export function getActiveObstacles(): AABB2D[] { return _obstacles; }

let _bounds: FloorBounds = { minX: FLOOR_MIN_X, minZ: FLOOR_MIN_Z, maxX: FLOOR_MAX_X, maxZ: FLOOR_MAX_Z };
/** Límites del piso de la oficina activa (los avatares no salen de ahí). */
export function getFloorBounds(): FloorBounds { return _bounds; }

export function createOfficeNavGrid(
  obstacles: AABB2D[] = [],
  anchors: ([number, number] | [number, number, number])[] = [],
  bounds?: FloorBounds,
  buffer = 0.3,
): OfficeNavGrid {
  if (bounds) _bounds = bounds;
  _obstacles = obstacles;
  const grid = new OfficeNavGrid(
    _bounds.minX,
    _bounds.minZ,
    _bounds.maxX,
    _bounds.maxZ,
    NAV_CELL_SIZE,
  );
  grid.rasterize(obstacles, buffer);

  // Clear walkable zones around anchor points (desks + chill spots)
  // Tercer valor opcional: radio a despejar (los sofás necesitan más, su centro queda dentro del mueble).
  for (const [x, z, r] of anchors as [number, number, number?][]) {
    grid.clearRadius(x, z, r ?? 0.8);
  }

  return grid;
}

// ─── Module-level singleton for per-frame collision checks ──────────────────
// Set by Office.tsx after building the grid, read by VoxelAvatar during useFrame.
let _activeGrid: OfficeNavGrid | null = null;

export function setActiveNavGrid(grid: OfficeNavGrid | null): void {
  _activeGrid = grid;
}

/** Check if a world position is walkable on the active grid.
 *  Returns true if no grid is set (fail-open). */
export function isWalkableWorld(x: number, z: number): boolean {
  if (!_activeGrid) return true;
  return _activeGrid.isWalkable(x, z);
}
