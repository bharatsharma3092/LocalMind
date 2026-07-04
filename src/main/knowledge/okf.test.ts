import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
  parseConcept,
  serializeConcept,
  parseFrontmatter,
  generateIndex,
  deriveTitle,
  safeConceptPath,
  type OkfConcept,
} from './okf'

describe('parseFrontmatter', () => {
  it('parses scalars, inline lists, and block lists', () => {
    const fm = parseFrontmatter(
      ['type: BigQuery Table', 'title: Orders', 'tags: [sales, orders]', 'count: 3', 'enabled: true'].join('\n')
    )
    expect(fm.type).toBe('BigQuery Table')
    expect(fm.tags).toEqual(['sales', 'orders'])
    expect(fm.count).toBe(3)
    expect(fm.enabled).toBe(true)
  })

  it('parses block-style lists', () => {
    const fm = parseFrontmatter(['tags:', '  - a', '  - b'].join('\n'))
    expect(fm.tags).toEqual(['a', 'b'])
  })
})

describe('parseConcept', () => {
  it('parses a conformant concept', () => {
    const raw = `---
type: Playbook
title: Incident Response
description: Steps to triage.
tags: [oncall, incident]
timestamp: 2026-04-12T09:00:00Z
---

# Trigger

Something fired.`
    const c = parseConcept('playbooks/incident', raw)
    expect(c.conformant).toBe(true)
    expect(c.type).toBe('Playbook')
    expect(c.title).toBe('Incident Response')
    expect(c.tags).toEqual(['oncall', 'incident'])
    expect(c.body).toContain('# Trigger')
  })

  it('treats a document without frontmatter as a permissive generic concept', () => {
    const c = parseConcept('notes/freeform', 'just some text\nmore text')
    expect(c.conformant).toBe(false)
    expect(c.type).toBe('Note')
    expect(c.title).toBe('Freeform')
    expect(c.body).toBe('just some text\nmore text')
  })

  it('falls back to a derived title when title is missing', () => {
    const c = parseConcept('tables/customer_orders', '---\ntype: Table\n---\nbody')
    expect(c.title).toBe('Customer Orders')
  })

  it('preserves unknown frontmatter keys in extra', () => {
    const c = parseConcept('x', '---\ntype: Note\nowner: bharat\n---\nbody')
    expect(c.extra.owner).toBe('bharat')
  })
})

describe('deriveTitle', () => {
  it('humanizes filenames', () => {
    expect(deriveTitle('tables/customer-orders')).toBe('Customer Orders')
    expect(deriveTitle('my_cool_note')).toBe('My Cool Note')
  })
})

describe('safeConceptPath', () => {
  it('prevents path traversal and normalizes', () => {
    expect(safeConceptPath('../../etc/passwd')).toBe('etc/passwd')
    expect(safeConceptPath('Personal Notes')).toBe('personal-notes')
    expect(safeConceptPath('a/../b')).toBe('a/b')
  })
})

describe('generateIndex', () => {
  it('groups concepts by type with links', () => {
    const concepts: OkfConcept[] = [
      { id: 'a', type: 'Note', title: 'A', tags: [], extra: {}, body: '', description: 'first' },
      { id: 'b', type: 'Playbook', title: 'B', tags: [], extra: {}, body: '' },
    ]
    const index = generateIndex(concepts)
    expect(index).toContain('## Note')
    expect(index).toContain('## Playbook')
    expect(index).toContain('[A](/a.md) - first')
  })
})

describe('round-trip', () => {
  it('serialize → parse preserves core fields', () => {
    const concept: OkfConcept = {
      id: 'tables/orders',
      type: 'BigQuery Table',
      title: 'Orders',
      description: 'One row per order.',
      resource: 'https://example.com/orders',
      tags: ['sales', 'orders'],
      timestamp: '2026-05-28T00:00:00Z',
      extra: {},
      body: '# Schema\n\nColumns here.',
    }
    const parsed = parseConcept(concept.id, serializeConcept(concept))
    expect(parsed.type).toBe(concept.type)
    expect(parsed.title).toBe(concept.title)
    expect(parsed.description).toBe(concept.description)
    expect(parsed.resource).toBe(concept.resource)
    expect(parsed.tags).toEqual(concept.tags)
    expect(parsed.timestamp).toBe(concept.timestamp)
    expect(parsed.body).toBe(concept.body)
  })

  // Property: round-trip stability for arbitrary safe content.
  it('Property: round-trip preserves type, tags, and body', () => {
    fc.assert(
      fc.property(
        fc.record({
          type: fc.constantFrom('Note', 'Playbook', 'Metric', 'Reference', 'Table'),
          title: fc.string({ minLength: 1, maxLength: 40 }).filter((s) => s.trim().length > 0),
          tags: fc.array(fc.stringMatching(/^[a-z][a-z0-9]{0,12}$/), { maxLength: 5 }),
          body: fc.string({ maxLength: 200 }),
        }),
        (input) => {
          const concept: OkfConcept = {
            id: 'concept',
            type: input.type,
            title: input.title.trim(),
            tags: input.tags,
            extra: {},
            body: input.body.trim(),
          }
          const parsed = parseConcept('concept', serializeConcept(concept))
          return (
            parsed.type === concept.type &&
            JSON.stringify(parsed.tags) === JSON.stringify(concept.tags) &&
            parsed.body === concept.body
          )
        }
      )
    )
  })
})
