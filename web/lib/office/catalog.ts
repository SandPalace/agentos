// Catálogo de assets 3D de la oficina. Cada entrada se extrae de `Office.glb` por el nombre de su nodo y se
// reorienta para que su frente mire a +Z (ángulo 0). `facing` es hacia dónde miraba en el archivo original.
//
// Convención de ángulos: un objeto con ángulo `a` mira hacia (sin a, cos a): 0 = +Z, π = -Z, π/2 = +X, -π/2 = -X.
// Unidades: las del archivo original (un escritorio doble mide 4.8 x 1.1 x 1.2).

export type Category = 'cowork' | 'meeting' | 'chill' | 'reception' | 'coffee' | 'decor' | 'wall'

export interface AssetDef {
  id: string
  label: string
  category: Category
  /** Nodos de Office.glb que forman la pieza. El primero define el tamaño y el pivote. */
  nodes: string[]
  /** Hacia dónde miraba en Office.glb (ángulo). */
  facing: number
  /** Incluir lo que está encima (monitores, máquina de café...) */
  onTop?: boolean
  /** Nodos de `onTop` que se descartan (por ejemplo laptops horneadas: el laptop animado se pone por código). */
  skip?: string[]
  /** Pieza hecha por código (voxel) en lugar de extraerse de Office.glb. */
  procedural?: 'pool-table'
  /** Medidas aproximadas [ancho, alto, fondo], para el catálogo y las pruebas. */
  size: [number, number, number]
}

// Los nombres con punto en Blender (Untitled.101) llegan a three.js sin el punto (Untitled101).
export const CATALOG: AssetDef[] = [
  // Cowork
  { id: 'bench', label: 'Escritorio doble con 2 monitores', category: 'cowork', nodes: ['desk-0910'], facing: 0, onTop: true, skip: ['Untitled186', 'Untitled187'], size: [4.8, 2.0, 1.2] },
  { id: 'desk', label: 'Escritorio individual', category: 'cowork', nodes: ['desk-01'], facing: 0, size: [3.2, 1.2, 1.1] },
  { id: 'chair', label: 'Silla de oficina', category: 'cowork', nodes: ['chair-09'], facing: Math.PI, size: [0.9, 1.5, 1.1] },
  // Sala de juntas
  { id: 'meet-table', label: 'Mesa de juntas', category: 'meeting', nodes: ['desk-meet01', 'desk-meet02'], facing: 0, size: [4.8, 1.1, 2.44] },
  { id: 'meet-chair', label: 'Silla de juntas', category: 'meeting', nodes: ['chair-meet-01'], facing: Math.PI, size: [0.9, 1.5, 1.1] },
  { id: 'whiteboard', label: 'Pizarrón', category: 'wall', nodes: ['Untitled183'], facing: 0, size: [2.2, 1.2, 0.2] },
  // Descanso
  { id: 'sofa', label: 'Sofá', category: 'chill', nodes: ['sofa-chill-01'], facing: 0, size: [2.7, 1.3, 1.4] },
  { id: 'lounge-chair', label: 'Sillón', category: 'chill', nodes: ['chair-chill-01'], facing: Math.PI / 2, size: [1.1, 1.4, 0.9] },
  { id: 'low-table', label: 'Mesa baja', category: 'chill', nodes: ['Untitled010'], facing: 0, size: [2.5, 0.5, 1.2] },
  { id: 'pool-table', label: 'Mesa de billar', category: 'chill', nodes: [], facing: 0, procedural: 'pool-table', size: [3.6, 2.7, 2.0] },
  { id: 'side-table', label: 'Mesa lateral', category: 'chill', nodes: ['Untitled169'], facing: 0, size: [0.7, 0.8, 0.7] },
  // Recepción
  { id: 'reception-desk', label: 'Mostrador de recepción', category: 'reception', nodes: ['desk-receptionist'], facing: Math.PI, onTop: true, size: [3.0, 1.6, 3.0] },
  { id: 'reception-chair', label: 'Silla de recepción', category: 'reception', nodes: ['chair-recepcionist'], facing: Math.PI, size: [0.9, 1.5, 1.1] },
  // Café
  { id: 'coffee-bar', label: 'Barra de café', category: 'coffee', nodes: ['Untitled181'], facing: Math.PI / 2, onTop: true, size: [1.2, 2.2, 3.2] },
  // Decoración
  { id: 'plant-tall', label: 'Planta alta', category: 'decor', nodes: ['Untitled101'], facing: 0, size: [0.8, 2.3, 0.8] },
  { id: 'bookshelf', label: 'Librero', category: 'decor', nodes: ['Untitled104'], facing: Math.PI / 2, size: [0.7, 2.2, 1.1] },
  { id: 'painting', label: 'Cuadro', category: 'wall', nodes: ['Untitled095'], facing: 0, size: [1.3, 1.0, 0.1] },
]

export const byId = (id: string) => {
  const a = CATALOG.find((x) => x.id === id)
  if (!a) throw new Error(`Asset desconocido: ${id}`)
  return a
}
