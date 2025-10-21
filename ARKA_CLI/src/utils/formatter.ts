// src/utils/formatter.ts

import chalk from 'chalk'

export function formatStatus(data: any): string {
  let output = '\n'

  // SOCLE
  output += chalk.bold('ARKA_LABS Status\n\n')
  output += chalk.bold('SOCLE\n')
  output += `  Version: ${data.socle.version}\n`
  output += `  Status:  ${getStatusIcon(data.socle.status)} ${data.socle.status}\n`
  output += `  Uptime:  ${formatUptime(data.socle.uptime)}\n\n`

  // Modules
  output += chalk.bold(`MODULES (${data.modules.length} active)\n`)
  data.modules.forEach((mod: any) => {
    const icon = mod.health === 'healthy' ? '🟢' : '🟡'
    output += `  ${icon} ${mod.name.padEnd(20)} ${mod.version.padEnd(8)} ${mod.health}\n`
  })
  output += '\n'

  // Sessions
  output += chalk.bold(`SESSIONS (${data.sessions.length} active)\n`)
  if (data.sessions.length === 0) {
    output += '  No active sessions\n'
  } else {
    data.sessions.forEach((sess: any) => {
      output += `  ${sess.id}  ${sess.agentId.padEnd(10)} ${sess.status.padEnd(8)}`
      output += ` ${sess.terminalId ? `terminal-${sess.terminalId}` : 'parked'.padEnd(10)}\n`
    })
  }
  output += '\n'

  // Context
  output += chalk.bold('CONTEXT\n')
  output += `  Version: ${data.context.version}\n`
  output += `  Updated: ${formatDate(data.context.lastUpdate)}\n`

  return output
}

export function formatSessionList(sessions: any[]): string {
  if (sessions.length === 0) {
    return '\nNo active sessions.\n\nRun \'arka session start\' to create one.\n'
  }

  let output = '\nACTIVE SESSIONS\n\n'
  output += 'ID          Agent      Status   Terminal   Duration\n'
  output += '─'.repeat(60) + '\n'

  sessions.forEach((sess: any) => {
    output += `${sess.id.padEnd(12)}`
    output += `${sess.agentId.padEnd(11)}`
    output += `${sess.status.padEnd(9)}`
    output += `${(sess.terminalId ? `terminal-${sess.terminalId}` : 'parked').padEnd(11)}`
    output += `${formatDuration(sess.duration)}\n`
  })

  output += '\nUse \'arka session attach <id>\' to attach to a session.\n'

  return output
}

export function formatFileList(files: any[]): string {
  if (files.length === 0) {
    return '\nNo files found.\n'
  }

  let output = '\nFILES IN ARKA_META\n\n'
  output += 'ID           Name                Type    Size     Tags\n'
  output += '─'.repeat(70) + '\n'

  files.forEach((file: any) => {
    output += `${file.id.substring(0, 12).padEnd(13)}`
    output += `${file.name.substring(0, 19).padEnd(20)}`
    output += `${file.type.padEnd(8)}`
    output += `${formatSize(file.size).padEnd(9)}`
    output += `${file.tags.slice(0, 3).join(', ')}\n`
  })

  output += '\n'
  return output
}

export function formatSearchResults(results: any[], query: string): string {
  if (results.length === 0) {
    return `\nNo results for: ${query}\n`
  }

  let output = `\nSEARCH RESULTS: ${query}\n\n`
  output += 'ID           Name                Type    Tags\n'
  output += '─'.repeat(60) + '\n'

  results.forEach((result: any) => {
    output += `${result.id.substring(0, 12).padEnd(13)}`
    output += `${result.name.substring(0, 19).padEnd(20)}`
    output += `${result.type.padEnd(8)}`
    output += `${result.tags.join(', ')}\n`
  })

  output += `\nFound ${results.length} results\n`
  return output
}

export function formatContext(context: any): string {
  let output = '\nCURRENT CONTEXT\n\n'

  output += `Version: ${context.version}\n`
  output += `Updated: ${formatDate(context.timestamp)}\n\n`

  output += 'USER\n'
  output += `  ID:   ${context.user?.id || 'N/A'}\n`
  output += `  Name: ${context.user?.name || 'N/A'}\n`
  output += `  Role: ${context.user?.role || 'N/A'}\n\n`

  output += 'PROJECT\n'
  output += `  ID:   ${context.project?.id || 'N/A'}\n`
  output += `  Name: ${context.project?.name || 'N/A'}\n\n`

  output += `PROVIDERS (${context.providers?.length || 0})\n`
  context.providers?.forEach((p: any) => {
    output += `  ${p.connected ? '✓' : '✗'} ${p.name}\n`
  })

  return output
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'running': return '🟢'
    case 'starting': return '🟡'
    case 'error': return '🔴'
    default: return '⚪'
  }
}

function formatUptime(ms: number): string {
  const hours = Math.floor(ms / 3600000)
  const minutes = Math.floor((ms % 3600000) / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  return `${hours}h ${minutes}m ${seconds}s`
}

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

export function formatDate(date: string | Date): string {
  const d = new Date(date)
  const now = new Date()
  const diff = now.getTime() - d.getTime()

  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} minutes ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} hours ago`
  return d.toLocaleString()
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

export function formatLogLevel(level: string): string {
  switch (level) {
    case 'debug': return chalk.gray('[DEBUG]')
    case 'info': return chalk.blue('[INFO] ')
    case 'warn': return chalk.yellow('[WARN] ')
    case 'error': return chalk.red('[ERROR]')
    default: return `[${level}]`
  }
}
