// src/commands/session/inspect.ts

import { Command } from 'commander'
import { SocleClient } from '../../client/socle-client.js'
import { logger } from '../../utils/logger.js'
import { resolveSessionId } from '../../utils/session-resolver.js'
import chalk from 'chalk'

export const sessionInspectCommand = new Command('inspect')
  .description('Inspect session details')
  .argument('[session-id]', 'Session ID (defaults to active session)')
  .option('--json', 'Output raw JSON payload')
  .action(async (sessionId: string | undefined, options: { json?: boolean }) => {
    try {
      await inspectSession(sessionId, options)
    } catch (error) {
      logger.error('Session inspect failed:', error as Error)
      process.exit(1)
    }
  })

export async function inspectSession(sessionId: string | undefined, options: { json?: boolean }): Promise<void> {
  const client = new SocleClient()

  const targetSessionId = await resolveSessionId(client, {
    sessionId,
    requireActive: false
  })

  const session = await client.getSession(targetSessionId)

  if (options.json) {
    console.log(JSON.stringify(session, null, 2))
    return
  }

  printSessionDetails(session)
}

function printSessionDetails(session: any): void {
  console.log(`\n${chalk.bold('SESSION')}`)
  console.log(`  ID:         ${session.id}`)
  console.log(`  Agent:      ${session.agentId}`)
  console.log(`  Profile:    ${session.profile}`)
  console.log(`  Provider:   ${session.provider}`)
  console.log(`  Status:     ${session.status}`)
  console.log(`  Terminal:   ${session.terminalId ?? 'parked'}`)
  console.log(`  Parked:     ${session.parked ? 'yes' : 'no'}`)
  console.log(`  Duration:   ${formatDuration(session.duration)}`)

  if (session.metadata) {
    console.log(`\n${chalk.bold('METADATA')}`)
    Object.entries(session.metadata).forEach(([key, value]) => {
      console.log(`  ${key}: ${value}`)
    })
  }

  if (session.lastEvents && Array.isArray(session.lastEvents) && session.lastEvents.length > 0) {
    console.log(`\n${chalk.bold('RECENT EVENTS')}`)
    session.lastEvents.forEach((event: any) => {
      const timestamp = event.timestamp ? new Date(event.timestamp).toLocaleString() : 'n/a'
      console.log(`  - ${timestamp} :: ${event.type || 'event'} :: ${event.message || ''}`)
    })
  }

  console.log()
}

function formatDuration(durationMs: number): string {
  if (!durationMs || durationMs <= 0) {
    return 'n/a'
  }

  const seconds = Math.floor(durationMs / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  const remainingMinutes = minutes % 60
  const remainingSeconds = seconds % 60

  const segments: string[] = []
  if (hours) segments.push(`${hours}h`)
  if (remainingMinutes) segments.push(`${remainingMinutes}m`)
  if (remainingSeconds) segments.push(`${remainingSeconds}s`)

  return segments.length > 0 ? segments.join(' ') : `${seconds}s`
}

