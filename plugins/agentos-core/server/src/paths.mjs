// Helpers de rutas que funcionan igual en macOS, Linux y Windows.
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// ¿Este módulo es el programa principal? (`file://${argv[1]}` falla en Windows: file:///C:/...)
export function isMain(metaUrl, argv1 = process.argv[1]) {
  if (!argv1) return false
  try { return path.resolve(fileURLToPath(metaUrl)) === path.resolve(argv1) } catch { return false }
}

// ¿`p` es `root` o está dentro? En Windows se compara sin distinguir mayúsculas. `mod` permite probar con path.win32.
export function pathInside(p, root, mod = path) {
  const ci = mod === path.win32 || (mod === path && process.platform === 'win32')
  let c = mod.resolve(p), r = mod.resolve(root)
  if (ci) { c = c.toLowerCase(); r = r.toLowerCase() }
  return c === r || c.startsWith(r.endsWith(mod.sep) ? r : r + mod.sep)
}
