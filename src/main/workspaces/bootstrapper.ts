import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs'
import { join } from 'path'

const templates = {
  'IDENTITY.md': [
    '# IDENTITY',
    '',
    'Name: LocalMind Personal Agent',
    'Emoji: 🤖',
    'Role: Adaptive Local-First Autonomous Personal Assistant',
    'Vibe: Intelligent, helpful, execution-oriented, and security-conscious.',
    '',
    '## Objective',
    'Act as the primary interface and core orchestrator of the user\'s local desktop environment, managing files, researching topics, executing scripts, and reasoning through problems.',
  ].join('\n'),

  'SOUL.md': [
    '# SOUL & BEHAVIORAL POLICY',
    '',
    '## Tone & Personality',
    '- Concise, professional, direct, and completely humble.',
    '- Avoid generic fluffy text, overly polite filler, or excessive conversational padding.',
    '- Ground assertions strictly in observable data and facts.',
    '',
    '## Behavioral Boundaries',
    '- Prioritize user safety and privacy above all else.',
    '- Clearly explain the consequences of high-risk actions (e.g. file deletions, terminal scripts) before requesting approvals.',
    '- Never refuse a directory access request if it lies within the user-approved workspace root directory.',
  ].join('\n'),

  'USER.md': [
    '# USER PROFILE',
    '',
    '## Preferences',
    '- Preferred Name: User',
    '- Address Preferences: Sir / Madam',
    '- Tone Preferences: Direct and task-focused',
    '',
    '## Custom Directives',
    '- Keep reasoning steps transparent.',
    '- Alert me of any external network activity before executing it.',
  ].join('\n'),

  'AGENTS.md': [
    '# AGENTS & WORKSPACE COMPOSITION',
    '',
    '## Operating Instructions',
    '- This directory serves as your active execution root directory.',
    '- You are free to explore, inspect, read, and write project code files inside this folder.',
    '- Utilize specialized sub-agent lanes (such as `code` or `research`) to split complex tasks into focused pipelines.',
    '',
    '## Exclusions',
    '- Do not index, read, or process directories like `.git`, `node_modules`, `out`, `dist`, or `build` unless explicitly requested.',
  ].join('\n'),

  'TOOLS.md': [
    '# TOOLS & EXECUTION PREFERENCES',
    '',
    '## Tool Sequences',
    '- **Step 1:** Always list or search files to understand the project structure before modifying unfamiliar directories.',
    '- **Step 2:** Inspect code targetsScoped edits are preferred over massive file overrides.',
    '- **Step 3:** Trigger local tests (`local__run_npm_script`) immediately after edits to verify changes.',
    '',
    '## Approvals',
    '- Explicit user approval is required for all script executions (`local__run_npm_script`), destructive deletions (`local__delete_path`), and outbound HTTP operations.',
  ].join('\n'),
}

export async function bootstrapWorkspace(rootPath: string): Promise<void> {
  if (!rootPath || !existsSync(rootPath)) {
    throw new Error(`Workspace path does not exist: ${rootPath}`)
  }

  const dotLocalmindDir = join(rootPath, '.localmind')

  if (!existsSync(dotLocalmindDir)) {
    mkdirSync(dotLocalmindDir, { recursive: true })
  }

  // Create default templates if missing
  for (const [filename, content] of Object.entries(templates)) {
    const filePath = join(dotLocalmindDir, filename)
    if (!existsSync(filePath)) {
      writeFileSync(filePath, content, 'utf-8')
      console.log(`[Bootstrapper] Templated new file at: ${filePath}`)
    }
  }
}

export interface WorkspaceContext {
  identity: string
  soul: string
  user: string
  agents: string
  tools: string
}

export async function getWorkspaceContext(rootPath: string): Promise<WorkspaceContext> {
  const context: WorkspaceContext = {
    identity: '',
    soul: '',
    user: '',
    agents: '',
    tools: '',
  }

  if (!rootPath || !existsSync(rootPath)) {
    return context
  }

  const dotLocalmindDir = join(rootPath, '.localmind')

  const filesMap: Record<keyof WorkspaceContext, string> = {
    identity: 'IDENTITY.md',
    soul: 'SOUL.md',
    user: 'USER.md',
    agents: 'AGENTS.md',
    tools: 'TOOLS.md',
  }

  for (const [key, filename] of Object.entries(filesMap) as [keyof WorkspaceContext, string][]) {
    // 1. Try reading from root of workspace first (for backward compatibility / power-user overrides)
    const rootPathFile = join(rootPath, filename)
    if (existsSync(rootPathFile)) {
      context[key] = readFileSync(rootPathFile, 'utf-8')
      continue
    }

    // 2. Fallback to hidden .localmind/ folder
    const hiddenPathFile = join(dotLocalmindDir, filename)
    if (existsSync(hiddenPathFile)) {
      context[key] = readFileSync(hiddenPathFile, 'utf-8')
    }
  }

  return context
}
