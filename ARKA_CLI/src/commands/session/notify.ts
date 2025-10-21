// src/commands/session/notify.ts

import { Command } from 'commander'
import crypto from 'crypto'
import fs from 'fs-extra'
import path from 'path'
import YAML from 'yaml'
import { SocleClient } from '../../client/socle-client.js'
import { logger } from '../../utils/logger.js'
import { CLIError, CLIErrorCode } from '../../utils/errors.js'

const TEXT_LIMIT = 256
const CROCKFORD_CHARS = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const ROSTER_RELATIVE_PATH = path.join('ARKA_META', '.system', 'coordination', 'ROSTER.yaml')

interface SessionNotifyOptions {
  agent: string
  text: string
  session?: string
  proposed?: boolean
  dryRun?: boolean
}

interface RosterAgent {
  agent_id: string
  active?: boolean
  session_id?: string | null
  proposed_session_id?: string | null
  updated_at?: string
}

interface RosterFile {
  agents: RosterAgent[]
}

interface NotificationResolution {
  sessionId: string
  roster: RosterFile
  usedAlias: boolean
  aliasGenerated?: string
}

export const sessionNotifyCommand = new Command('notify')
  .description('Send a lightweight notification to a session, resolving the target from the roster')
  .requiredOption('--agent <id>', 'Target agent identifier')
  .requiredOption('--text <message>', 'Notification text (<=256 characters)')
  .option('--session <id>', 'Override session identifier')
  .option('--proposed', 'Force usage (or creation) of a temporary alias')
  .option('--dry-run', 'Simulate resolution without sending or persisting changes')
  .action(async (options: SessionNotifyOptions) => {
    try {
      await runSessionNotify(options)
    } catch (error) {
      logger.error('Session notify failed:', error as Error)
      process.exit(1)
    }
  })

export async function runSessionNotify(options: SessionNotifyOptions): Promise<void> {
  const message = options.text.trim()
  if (!message) {
    throw new CLIError(
      CLIErrorCode.INVALID_PARAMS,
      'Notification text cannot be empty',
      ['Provide --text with at least one non-space character']
    )
  }

  if (message.length > TEXT_LIMIT) {
    throw new CLIError(
      CLIErrorCode.INVALID_PARAMS,
      `Notification text must be <= ${TEXT_LIMIT} characters`,
      ['Shorten the message before retrying']
    )
  }

  if (options.proposed && options.session) {
    throw new CLIError(
      CLIErrorCode.INVALID_PARAMS,
      'Cannot combine --session with --proposed',
      ['Remove --proposed to target the explicit session', 'Remove --session to force alias resolution']
    )
  }

  const rosterPath = path.join(process.cwd(), ROSTER_RELATIVE_PATH)
  const roster = await loadRoster(rosterPath)
  const resolution = resolveNotificationTarget(roster, options)

  logger.info(`Agent ciblé : ${options.agent}`)
  logger.info(`Session visée : ${resolution.sessionId}${resolution.usedAlias ? ' (alias temporaire)' : ''}`)
  if (resolution.aliasGenerated) {
    logger.info(`Nouvel alias généré : ${resolution.aliasGenerated}`)
  }

  if (options.dryRun) {
    logger.warn('Mode dry-run activé : aucune notification envoyée, roster inchangé')
    return
  }

  const client = new SocleClient()
  await client.notifySession(resolution.sessionId, message)
  await saveRoster(rosterPath, resolution.roster)

  logger.success('Notification envoyée et roster synchronisé')
}

async function loadRoster(filePath: string): Promise<RosterFile> {
  try {
    if (!(await fs.pathExists(filePath))) {
      return { agents: [] }
    }
    const raw = await fs.readFile(filePath, 'utf-8')
    const parsed = YAML.parse(raw) ?? {}
    const agents = Array.isArray(parsed.agents) ? parsed.agents : []
    const normalised: RosterAgent[] = []
    for (const agent of agents) {
      if (typeof agent?.agent_id !== 'string' || agent.agent_id.trim().length === 0) {
        continue
      }
      normalised.push({
        agent_id: agent.agent_id.trim(),
        active: agent.active ?? true,
        session_id: normaliseId(agent.session_id),
        proposed_session_id: normaliseId(agent.proposed_session_id),
        updated_at: typeof agent.updated_at === 'string' ? agent.updated_at : undefined
      })
    }
    return { agents: normalised }
  } catch {
    throw new CLIError(
      CLIErrorCode.INVALID_PARAMS,
      `Unable to read roster at ${filePath}`,
      ['Verify YAML syntax', 'Ensure the file is accessible']
    )
  }
}

async function saveRoster(filePath: string, roster: RosterFile): Promise<void> {
  const dir = path.dirname(filePath)
  await fs.mkdir(dir, { recursive: true })
  const content = YAML.stringify({ agents: roster.agents }, { indent: 2 })
  await fs.writeFile(filePath, content, 'utf-8')
}

function resolveNotificationTarget(roster: RosterFile, options: SessionNotifyOptions): NotificationResolution {
  const now = new Date().toISOString()
  const updatedRoster: RosterFile = {
    agents: roster.agents.map((agent) => ({ ...agent }))
  }

  let agentEntry = updatedRoster.agents.find((agent) => agent.agent_id === options.agent)
  if (!agentEntry) {
    agentEntry = {
      agent_id: options.agent,
      active: true,
      session_id: null,
      proposed_session_id: null,
      updated_at: now
    }
    updatedRoster.agents.push(agentEntry)
  }

  agentEntry.active = agentEntry.active ?? true
  agentEntry.updated_at = now

  if (options.session) {
    const explicitSession = options.session.trim()
    if (!explicitSession) {
      throw new CLIError(
        CLIErrorCode.INVALID_PARAMS,
        'Session override provided but empty',
        ['Provide a valid session id to --session']
      )
    }
    agentEntry.session_id = explicitSession
    agentEntry.proposed_session_id = null
    return {
      sessionId: explicitSession,
      roster: updatedRoster,
      usedAlias: false
    }
  }

  if (options.proposed) {
    let generatedAlias: string | undefined
    if (!agentEntry.proposed_session_id) {
      agentEntry.proposed_session_id = generateAlias()
      generatedAlias = agentEntry.proposed_session_id
    }
    agentEntry.session_id = null
    return {
      sessionId: agentEntry.proposed_session_id,
      roster: updatedRoster,
      usedAlias: true,
      aliasGenerated: generatedAlias
    }
  }

  if (agentEntry.session_id) {
    return {
      sessionId: agentEntry.session_id,
      roster: updatedRoster,
      usedAlias: false
    }
  }

  if (agentEntry.proposed_session_id) {
    return {
      sessionId: agentEntry.proposed_session_id,
      roster: updatedRoster,
      usedAlias: true
    }
  }

  const newAlias = generateAlias()
  agentEntry.proposed_session_id = newAlias
  agentEntry.session_id = null
  return {
    sessionId: newAlias,
    roster: updatedRoster,
    usedAlias: true,
    aliasGenerated: newAlias
  }
}

function generateAlias(): string {
  return `temp_ulid_${generateUlid().toLowerCase()}`
}

function normaliseId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function generateUlid(): string {
  const time = Date.now()
  const timePart = encodeTime(time, 10)
  const randomPart = encodeRandom(16)
  return `${timePart}${randomPart}`
}

function encodeTime(time: number, length: number): string {
  let value = time
  let output = ''
  for (let i = 0; i < length; i++) {
    const mod = value % 32
    output = CROCKFORD_CHARS[mod] + output
    value = Math.floor(value / 32)
  }
  return output
}

function encodeRandom(length: number): string {
  const bytes = crypto.randomBytes(length)
  let output = ''
  for (let i = 0; i < length; i++) {
    output += CROCKFORD_CHARS[bytes[i] & 31]
  }
  return output
}
