import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  archivosHref, childrenOf, contentTypeFor, deliveryFolder, formatSize, initialUploads, isEditable, listingUrl, normalizePrefix, objectUrl,
  outputFileUrl, parseCsv, parseTrashKey, previewKind, safeLink, searchEntries, sortRows, storageBadge, trashItems, uniqueName, uploadLimitMessage,
  uploadReducer, uploadSummary, validateName, zipUrl, zoneCrumbs, zoneOf, parentPrefix, MAX_UPLOAD_BYTES, folderPrefixes, folderDepth, isInside,
} from './files.ts'

test('previewKind uses content type first, extension as fallback', () => {
  assert.equal(previewKind('image/png', 'x'), 'image')
  assert.equal(previewKind('text/markdown; charset=utf-8', 'a.md'), 'markdown')
  assert.equal(previewKind('text/csv', 'a.csv'), 'csv')
  assert.equal(previewKind('text/html; charset=utf-8', 'a.html'), 'html')
  assert.equal(previewKind('application/pdf', 'a.pdf'), 'pdf')
  assert.equal(previewKind('application/octet-stream', 'notes.MD'), 'markdown')
  assert.equal(previewKind('text/plain', 'data.csv'), 'csv')
  assert.equal(previewKind('text/plain', 'readme'), 'text')
  assert.equal(previewKind('application/zip', 'a.zip'), 'none')
  assert.equal(previewKind(null, 'photo.jpeg'), 'image')
})

test('formatSize', () => {
  assert.equal(formatSize(90), '90 B')
  assert.equal(formatSize(2048), '2.0 KB')
  assert.equal(formatSize(5 * 1024 * 1024), '5.0 MB')
  assert.equal(formatSize(null), '')
})

test('storageBadge', () => {
  assert.equal(storageBadge({ kind: 'file', stored: true, storage_error: null })?.label, 'Guardado en Archivos')
  assert.equal(storageBadge({ kind: 'file', stored: true, storage_error: null })?.kind, 'stored')
  assert.equal(storageBadge({ kind: 'file', stored: false, storage_error: null }), null)
  assert.equal(storageBadge({ kind: 'file', stored: false, storage_error: 'boom' })?.kind, 'error')
  assert.equal(storageBadge({ kind: 'link', stored: false, storage_error: null })?.kind, 'link')
})

test('urls are encoded and carry the workspace', () => {
  assert.equal(outputFileUrl('http://s', 'acme', 7, { file: 'a b/c.png', download: true }), 'http://s/api/files/7?workspace=acme&file=a%20b%2Fc.png&download=1')
  assert.equal(objectUrl('http://s', 'a', 'outputs/T 1/x.md'), 'http://s/api/workspaces/a/object?key=outputs%2FT%201%2Fx.md')
  assert.equal(listingUrl('http://s', 'a', 'outputs/'), 'http://s/api/workspaces/a/files?prefix=outputs%2F')
})

test('safeLink allows only http(s)', () => {
  assert.equal(safeLink('https://example.com/a'), 'https://example.com/a')
  assert.equal(safeLink('javascript:alert(1)'), null)
  assert.equal(safeLink('/Users/x/file'), null)
})

test('parseCsv', () => {
  assert.deepEqual(parseCsv('a,b\n1,"x,y"\r\n"q ""z""",3'), [['a', 'b'], ['1', 'x,y'], ['q "z"', '3']])
  assert.deepEqual(parseCsv('a\tb', '\t'), [['a', 'b']])
})

const F = (key: string, size = 10, lm: string | null = '2026-10-13T10:00:00Z') => ({ key, name: key, size, last_modified: lm, content_type: 'text/plain' })

test('normalizePrefix and zones', () => {
  assert.equal(normalizePrefix(''), 'files/')
  assert.equal(normalizePrefix(null), 'files/')
  assert.equal(normalizePrefix('files/a'), 'files/a/')
  assert.equal(normalizePrefix('outputs/T-1/'), 'outputs/T-1/')
  assert.equal(normalizePrefix('trash'), 'trash/')
  assert.equal(normalizePrefix('docs/x'), 'files/docs/x/')
  assert.equal(normalizePrefix('files/../etc'), 'files/')
  assert.equal(zoneOf('outputs/x/'), 'outputs')
  assert.equal(zoneOf('trash/'), 'trash')
  assert.equal(zoneOf('files/a/'), 'files')
})

test('zoneCrumbs starts at the zone root label', () => {
  assert.deepEqual(zoneCrumbs('files/'), [{ name: 'Archivos del equipo', prefix: 'files/' }])
  assert.deepEqual(zoneCrumbs('files/a/b/'), [{ name: 'Archivos del equipo', prefix: 'files/' }, { name: 'a', prefix: 'files/a/' }, { name: 'b', prefix: 'files/a/b/' }])
  assert.equal(zoneCrumbs('outputs/T-1/')[0].name, 'Entregas de tareas')
  assert.equal(parentPrefix('files/a/b/'), 'files/a/')
  assert.equal(parentPrefix('files/'), '')
})

test('childrenOf derives folders and files, includes empty folders, hides .keep', () => {
  const files = [F('files/a/x.md', 5), F('files/a/b/y.txt', 7, '2026-10-14T10:00:00Z'), F('files/root.csv', 1), F('files/a/.keep', 0), F('files/e/.keep', 0)]
  const folders = [{ prefix: 'files/a/', name: 'a' }, { prefix: 'files/a/b/', name: 'a/b' }, { prefix: 'files/e/', name: 'e' }, { prefix: 'files/empty/', name: 'empty' }]
  const root = childrenOf('files/', files, folders)
  assert.deepEqual(root.folders.map((f) => f.name).sort(), ['a', 'e', 'empty'])
  assert.deepEqual(root.files.map((f) => f.name), ['root.csv'])
  const a = root.folders.find((f) => f.name === 'a')!
  assert.equal(a.count, 2)
  assert.equal(a.size, 12)
  assert.equal(a.last_modified, '2026-10-14T10:00:00Z')
  const inA = childrenOf('files/a/', files, folders)
  assert.deepEqual(inA.folders.map((f) => f.prefix), ['files/a/b/'])
  assert.deepEqual(inA.files.map((f) => f.name), ['x.md'])
})

test('searchEntries matches names recursively', () => {
  const files = [F('files/a/Informe.md'), F('files/a/b/informe-final.pdf'), F('files/z.txt')]
  const r = searchEntries('files/', files, [{ prefix: 'files/informes/', name: 'informes' }], 'INFORME')
  assert.deepEqual(r.files.map((f) => f.name), ['a/Informe.md', 'a/b/informe-final.pdf'])
  assert.deepEqual(r.folders.map((f) => f.name), ['informes'])
  assert.equal(searchEntries('files/a/', files, [], 'z').files.length, 0)
})

test('sortRows: numeric names, date, size, direction', () => {
  const rows = [{ name: 'a10', size: 1, last_modified: '2026-01-02' }, { name: 'a2', size: 3, last_modified: '2026-01-03' }, { name: 'B', size: 2, last_modified: '2026-01-01' }]
  assert.deepEqual(sortRows(rows, 'name', 'asc').map((r) => r.name), ['a2', 'a10', 'B'])
  assert.deepEqual(sortRows(rows, 'size', 'desc').map((r) => r.name), ['a2', 'B', 'a10'])
  assert.deepEqual(sortRows(rows, 'date', 'asc').map((r) => r.name), ['B', 'a10', 'a2'])
})

test('validateName', () => {
  assert.equal(validateName('informe.md'), null)
  assert.ok(validateName('  '))
  assert.ok(validateName('a/b'))
  assert.ok(validateName('..'))
  assert.ok(validateName('x'.repeat(200)))
})

test('uniqueName adds a numeric suffix before the extension', () => {
  assert.equal(uniqueName('a.md', new Set()), 'a.md')
  assert.equal(uniqueName('a.md', new Set(['a.md'])), 'a (1).md')
  assert.equal(uniqueName('a.md', new Set(['a.md', 'a (1).md'])), 'a (2).md')
  assert.equal(uniqueName('.env', new Set(['.env'])), '.env (1)')
  assert.equal(uniqueName('folder', (n) => n === 'folder'), 'folder (1)')
})

test('trash parsing and grouping', () => {
  assert.deepEqual(parseTrashKey('trash/1791921630759/files/a/x.md'), { ts: 1791921630759, originalKey: 'files/a/x.md' })
  assert.equal(parseTrashKey('files/a'), null)
  const items = trashItems([
    F('trash/100/files/a/b/y.txt', 2), F('trash/100/files/a/b/c/z.txt', 3), F('trash/200/files/a/x.md', 4), F('trash/200/files/a/b/.keep', 0),
  ])
  assert.equal(items.length, 2)
  const folder = items.find((i) => i.ts === 100)!
  assert.equal(folder.isFolder, true)
  assert.equal(folder.originalKey, 'files/a/b')
  assert.equal(folder.trashKey, 'trash/100/files/a/b')
  assert.equal(folder.count, 2)
  assert.equal(folder.size, 5)
  const file = items.find((i) => i.ts === 200)!
  assert.equal(file.name, 'x.md')
  assert.equal(file.isFolder, false)
  assert.equal(items[0].ts, 200)
  // two root-level files deleted at the same millisecond stay separate (never restore the whole root)
  assert.equal(trashItems([F('trash/5/files/a.md'), F('trash/5/files/b.md')]).length, 2)
})

test('contentTypeFor / isEditable / limit message', () => {
  assert.equal(contentTypeFor('a.md', ''), 'text/markdown')
  assert.equal(contentTypeFor('a.csv', 'application/octet-stream'), 'text/csv')
  assert.equal(contentTypeFor('a.png', 'image/png'), 'image/png')
  assert.equal(contentTypeFor('x.bin', ''), 'application/octet-stream')
  assert.equal(isEditable('text/markdown', 'a.md'), true)
  assert.equal(isEditable('text/html', 'a.html'), true)
  assert.equal(isEditable('image/png', 'a.png'), false)
  assert.equal(isEditable('application/pdf', 'a.pdf'), false)
  assert.match(uploadLimitMessage('big.zip', 60 * 1024 * 1024), /60 MB.*50 MB/)
  assert.equal(MAX_UPLOAD_BYTES, 52428800)
})

test('deliveryFolder / archivosHref', () => {
  assert.equal(deliveryFolder('outputs/T-1/a/b.md'), 'outputs/T-1/a/')
  assert.equal(deliveryFolder('files/x.md'), 'files/')
  assert.equal(deliveryFolder('files/docs/x.md'), 'files/docs/')
  assert.equal(deliveryFolder('trash/1/files/x'), null)
  assert.equal(deliveryFolder(null), null)
  assert.equal(archivosHref('outputs/T-1/'), '/archivos?prefix=outputs%2FT-1%2F')
})

test('listing and zip urls', () => {
  assert.equal(listingUrl('http://s', 'a', 'files/', { recursive: true, cursor: 'k 1', limit: 500 }), 'http://s/api/workspaces/a/files?prefix=files%2F&recursive=1&limit=500&cursor=k%201')
  assert.equal(zipUrl('http://s', 'a', 'files/a b/'), 'http://s/api/workspaces/a/zip?prefix=files%2Fa%20b')
})

test('upload reducer: lifecycle, errors, cancel, summary', () => {
  let s = uploadReducer(initialUploads, { type: 'add', items: [
    { name: 'a', key: 'files/a', size: 100, overwrite: false },
    { name: 'b', key: 'files/b', size: 100, overwrite: true },
    { name: 'big', key: 'files/big', size: 999, overwrite: false, error: 'too big' },
  ] })
  assert.deepEqual(s.items.map((i) => i.status), ['queued', 'queued', 'error'])
  s = uploadReducer(s, { type: 'start', id: 1 })
  s = uploadReducer(s, { type: 'progress', id: 1, loaded: 50 })
  assert.equal(s.items[0].loaded, 50)
  s = uploadReducer(s, { type: 'progress', id: 1, loaded: 500 })
  assert.equal(s.items[0].loaded, 100)
  s = uploadReducer(s, { type: 'done', id: 1 })
  s = uploadReducer(s, { type: 'cancel', id: 2 })
  s = uploadReducer(s, { type: 'cancel', id: 1 }) // finished items cannot be cancelled
  assert.deepEqual(s.items.map((i) => i.status), ['done', 'cancelled', 'error'])
  const sum = uploadSummary(s.items)
  assert.equal(sum.done, 1)
  assert.equal(sum.failed, 1)
  assert.equal(sum.active, 0)
  s = uploadReducer(s, { type: 'clear-finished' })
  assert.equal(s.items.length, 0)
})

test('folderPrefixes adds ancestors and empty folders, sorted; depth and isInside', () => {
  const list = folderPrefixes('files/', [F('files/b/c/d.md'), F('files/a2/x'), F('files/a10/x'), F('files/top.md')], [{ prefix: 'files/empty/' }])
  assert.deepEqual(list, ['files/a2/', 'files/a10/', 'files/b/', 'files/b/c/', 'files/empty/'])
  assert.equal(folderDepth('files/', 'files/b/c/'), 2)
  assert.equal(isInside('files/b/c/', 'files/b/'), true)
  assert.equal(isInside('files/bb/', 'files/b/'), false)
})
