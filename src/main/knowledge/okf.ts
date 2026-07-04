/**
 * Open Knowledge Format (OKF) v0.1 — pure parser/serializer.
 *
 * OKF is a vendor-neutral standard (Google Cloud, 2026): a bundle is a directory
 * of markdown files with YAML frontmatter. Each file is one "concept"; only the
 * `type` frontmatter field is required. Consumers must be permissive.
 *
 * This module is intentionally free of Electron/fs imports so it can be unit-tested
 * directly. I/O (reading/writing directories) lives in the manager layer.
 */

export interface OkfConcept {
  /** Concept ID = file path within the bundle without the .md suffix (e.g. "tables/orders"). */
  id: string
  /** REQUIRED OKF frontmatter field. */
  type: string
  title?: string
  description?: string
  resource?: string
  tags: string[]
  timestamp?: string
  /** Any additional producer-defined frontmatter keys (preserved on round-trip). */
  extra: Record<string, unknown>
  /** Markdown body (everything after the frontmatter). */
  body: string
}

export interface ParsedConcept extends OkfConcept {
  /** True if the document had a parseable frontmatter block with a non-empty `type`. */
  conformant: boolean
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/

// ─── YAML (minimal subset sufficient for OKF frontmatter) ─────────────────────

/** Strip surrounding matching quotes from a scalar. */
function unquote(value: string): string {
  const v = value.trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1)
  }
  return v
}

/** Parse a scalar value into string | number | boolean. */
function parseScalar(raw: string): string | number | boolean {
  const v = unquote(raw)
  if (v === 'true') return true
  if (v === 'false') return false
  if (v !== '' && !Number.isNaN(Number(v)) && /^-?\d+(\.\d+)?$/.test(v)) return Number(v)
  return v
}

/** Parse an inline flow list: [a, b, c]. */
function parseInlineList(raw: string): string[] {
  const inner = raw.trim().replace(/^\[/, '').replace(/\]$/, '').trim()
  if (!inner) return []
  return inner.split(',').map((s) => unquote(s.trim())).filter(Boolean)
}

/**
 * Minimal YAML frontmatter parser. Supports scalars, inline lists, and simple
 * block lists (`- item`). Sufficient for OKF frontmatter; not a general YAML parser.
 */
export function parseFrontmatter(yaml: string): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const lines = yaml.split(/\r?\n/)
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    i++
    if (!line.trim() || line.trim().startsWith('#')) continue
    const colon = line.indexOf(':')
    if (colon === -1) continue
    const key = line.slice(0, colon).trim()
    const rest = line.slice(colon + 1).trim()
    if (!key) continue

    if (rest === '') {
      // Could be a block list following on subsequent indented `- ` lines.
      const items: string[] = []
      while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
        items.push(unquote(lines[i].replace(/^\s*-\s+/, '').trim()))
        i++
      }
      out[key] = items.length > 0 ? items : ''
    } else if (rest.startsWith('[')) {
      out[key] = parseInlineList(rest)
    } else {
      out[key] = parseScalar(rest)
    }
  }
  return out
}

function asString(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined
  return String(v)
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean)
  if (typeof v === 'string' && v.trim()) return [v.trim()]
  return []
}

/**
 * Parse a single OKF concept document.
 * @param id  Concept ID (path without .md), used for fallback title.
 * @param raw Full file contents.
 */
export function parseConcept(id: string, raw: string): ParsedConcept {
  const match = raw.match(FRONTMATTER_RE)
  if (!match) {
    // No frontmatter — non-conformant, but consumers must be permissive (treat as generic).
    return {
      id,
      type: 'Note',
      title: deriveTitle(id),
      tags: [],
      extra: {},
      body: raw.trim(),
      conformant: false,
    }
  }

  const fm = parseFrontmatter(match[1])
  const body = (match[2] ?? '').trim()
  const knownKeys = new Set(['type', 'title', 'description', 'resource', 'tags', 'timestamp'])
  const extra: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(fm)) {
    if (!knownKeys.has(k)) extra[k] = v
  }

  const type = asString(fm.type)?.trim()
  return {
    id,
    type: type && type.length > 0 ? type : 'Note',
    title: asString(fm.title) ?? deriveTitle(id),
    description: asString(fm.description),
    resource: asString(fm.resource),
    tags: asStringArray(fm.tags),
    timestamp: asString(fm.timestamp),
    extra,
    body,
    conformant: !!type && type.length > 0,
  }
}

/** Derive a human title from a concept id (filename). */
export function deriveTitle(id: string): string {
  const base = id.split('/').pop() ?? id
  return base
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()
}

// ─── Serialization ────────────────────────────────────────────────────────────

function yamlScalar(value: string): string {
  // Quote if it contains characters that would confuse the minimal parser.
  if (/[:#]|^\s|\s$|^["']/.test(value) || value === '') return JSON.stringify(value)
  return value
}

/** Serialize a concept back into an OKF markdown document (frontmatter + body). */
export function serializeConcept(concept: OkfConcept): string {
  const fm: string[] = ['---']
  fm.push(`type: ${yamlScalar(concept.type || 'Note')}`)
  if (concept.title) fm.push(`title: ${yamlScalar(concept.title)}`)
  if (concept.description) fm.push(`description: ${yamlScalar(concept.description)}`)
  if (concept.resource) fm.push(`resource: ${yamlScalar(concept.resource)}`)
  if (concept.tags && concept.tags.length > 0) {
    fm.push(`tags: [${concept.tags.map((t) => yamlScalar(t)).join(', ')}]`)
  }
  if (concept.timestamp) fm.push(`timestamp: ${concept.timestamp}`)
  for (const [k, v] of Object.entries(concept.extra ?? {})) {
    if (Array.isArray(v)) fm.push(`${k}: [${v.map((x) => yamlScalar(String(x))).join(', ')}]`)
    else fm.push(`${k}: ${yamlScalar(String(v))}`)
  }
  fm.push('---')
  return `${fm.join('\n')}\n\n${concept.body.trim()}\n`
}

/**
 * Generate a bundle-root `index.md` for progressive disclosure.
 * Index files contain no frontmatter (per spec §6), grouped by `type`.
 */
export function generateIndex(concepts: OkfConcept[], heading = 'Knowledge Bundle'): string {
  const byType = new Map<string, OkfConcept[]>()
  for (const c of concepts) {
    const list = byType.get(c.type) ?? []
    list.push(c)
    byType.set(c.type, list)
  }
  const sections: string[] = [`# ${heading}`, '']
  for (const [type, list] of [...byType.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    sections.push(`## ${type}`)
    sections.push('')
    for (const c of list.sort((a, b) => a.id.localeCompare(b.id))) {
      const desc = c.description ? ` - ${c.description}` : ''
      sections.push(`* [${c.title ?? deriveTitle(c.id)}](/${c.id}.md)${desc}`)
    }
    sections.push('')
  }
  return sections.join('\n').trim() + '\n'
}

/** Sanitize an arbitrary string into a safe relative concept file path (no traversal). */
export function safeConceptPath(id: string): string {
  return id
    .replace(/\\/g, '/')
    .split('/')
    .map((seg) =>
      seg
        .replace(/[^a-zA-Z0-9 _.-]+/g, '')
        .replace(/\.+/g, '.')
        .replace(/^\.+|\.+$/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .toLowerCase()
    )
    .filter((seg) => seg.length > 0 && seg !== '.' && seg !== '..')
    .join('/')
}

export const RESERVED_FILENAMES = new Set(['index.md', 'log.md'])
