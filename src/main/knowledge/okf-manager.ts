import { promises as fs } from 'fs'
import { join, relative, sep } from 'path'
import {
  parseConcept,
  serializeConcept,
  generateIndex,
  safeConceptPath,
  RESERVED_FILENAMES,
  type ParsedConcept,
  type OkfConcept,
} from './okf'
import { memoryService } from '../memory/memory-service'
import type { MemoryRecord } from '@shared/types/ai-os'

/**
 * Bridges the pure OKF format module to the filesystem and the Memory Layer:
 * - import an OKF bundle directory → Memory records
 * - export Memory records → an OKF bundle directory
 */

/** Recursively collect all non-reserved .md files under a directory, returning bundle-relative ids. */
async function collectConceptFiles(root: string, dir = root): Promise<string[]> {
  const out: string[] = []
  let entries: Awaited<ReturnType<typeof fs.readdir>>
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...(await collectConceptFiles(root, full)))
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      if (RESERVED_FILENAMES.has(entry.name.toLowerCase())) continue
      out.push(full)
    }
  }
  return out
}

export interface ImportResult {
  imported: number
  skipped: number
  concepts: Array<{ id: string; type: string; title?: string; conformant: boolean }>
}

/**
 * Import an OKF bundle directory into the Memory Layer.
 * Each concept becomes a memory record (frontmatter → kind/tags metadata, body → content).
 */
export async function importOkfBundle(bundleDir: string): Promise<ImportResult> {
  const files = await collectConceptFiles(bundleDir)
  const concepts: ParsedConcept[] = []
  for (const file of files) {
    try {
      const raw = await fs.readFile(file, 'utf-8')
      const id = relative(bundleDir, file).split(sep).join('/').replace(/\.md$/i, '')
      concepts.push(parseConcept(id, raw))
    } catch {
      /* skip unreadable file */
    }
  }

  let imported = 0
  let skipped = 0
  for (const c of concepts) {
    // Compose a memory content block: a titled concept with its type and body.
    const header = [c.title ? `# ${c.title}` : null, c.description ? `_${c.description}_` : null]
      .filter(Boolean)
      .join('\n')
    const content = [header, c.body].filter(Boolean).join('\n\n').trim()
    if (!content) {
      skipped++
      continue
    }
    try {
      await memoryService.create({ content, kind: `okf:${c.type}` })
      imported++
    } catch {
      skipped++
    }
  }

  return {
    imported,
    skipped,
    concepts: concepts.map((c) => ({ id: c.id, type: c.type, title: c.title, conformant: c.conformant })),
  }
}

/** Convert a memory record into an OKF concept. */
function recordToConcept(record: MemoryRecord): OkfConcept {
  // Memory content may start with a markdown H1 we use as the title.
  const lines = record.content.split('\n')
  let title: string | undefined
  let body = record.content
  if (lines[0]?.startsWith('# ')) {
    title = lines[0].replace(/^#\s+/, '').trim()
    body = lines.slice(1).join('\n').trim()
  }
  const type = record.kind.startsWith('okf:') ? record.kind.slice(4) : record.kind === 'summary' ? 'Task Memory' : 'Memory'
  const safeId = safeConceptPath(title || record.id) || record.id
  return {
    id: `memories/${safeId}`,
    type,
    title: title ?? `Memory ${record.id.slice(0, 8)}`,
    tags: [],
    extra: { localmind_id: record.id, enabled: record.enabled },
    timestamp: new Date(record.updatedAt || record.createdAt).toISOString(),
    body,
  }
}

export interface ExportResult {
  exported: number
  bundleDir: string
}

/**
 * Export all (or the given) memory records as a conformant OKF bundle.
 * Writes concept files plus an auto-generated index.md.
 */
export async function exportOkfBundle(bundleDir: string, records?: MemoryRecord[]): Promise<ExportResult> {
  const all = records ?? (await memoryService.list())
  const concepts = all.map(recordToConcept)

  await fs.mkdir(bundleDir, { recursive: true })

  // Deduplicate ids (titles can collide) by suffixing.
  const usedIds = new Set<string>()
  for (const c of concepts) {
    let id = c.id
    let n = 2
    while (usedIds.has(id)) {
      id = `${c.id}-${n++}`
    }
    usedIds.add(id)
    c.id = id

    const filePath = join(bundleDir, `${id}.md`)
    await fs.mkdir(join(filePath, '..'), { recursive: true })
    await fs.writeFile(filePath, serializeConcept(c), 'utf-8')
  }

  await fs.writeFile(join(bundleDir, 'index.md'), generateIndex(concepts, 'LocalMind Memory Bundle'), 'utf-8')

  return { exported: concepts.length, bundleDir }
}
