#!/usr/bin/env node
/**
 * Guardian messaging check
 * Exécute `npm exec arkamsg -- pull --agent <id>` pour une liste d'agents,
 * afin de purger/ack leurs inbox avant de déclencher un ordre strict.
 *
 * Usage :
 *   node ARKA_OS/ARKA_CORE/scripts/guardian/guardian-check-messages.mjs --agents pmo,core-archivist --verbose
 *
 * Options :
 *   --agents a,b,c    Agents ciblés (obligatoire).
 *   --agent a         Ajoute un agent (répétable).
 *   --no-ack          Passe --no-ack à arkamsg (défaut : ack actif).
 *   --no-mark         Passe --no-mark à arkamsg.
 *   --verbose         Passe --verbose à arkamsg (affiche les messages).
 *   --dry-run         N'exécute pas arkamsg, journalise uniquement.
 */

import { spawn } from 'node:child_process'

function parseArgs(argv) {
  const args = argv.slice(2)
  const options = {
    agents: [],
    noAck: false,
    noMark: false,
    verbose: false,
    dryRun: false
  }

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i]
    const next = () => args[++i]

    switch (token) {
      case '--agents':
        options.agents.push(...(next() || '').split(',').map((s) => s.trim()).filter(Boolean))
        break
      case '--agent':
        options.agents.push(next())
        break
      case '--no-ack':
        options.noAck = true
        break
      case '--no-mark':
        options.noMark = true
        break
      case '--verbose':
        options.verbose = true
        break
      case '--dry-run':
        options.dryRun = true
        break
      case '--help':
      case '-h':
        printUsage()
        process.exit(0)
        break
      default:
        console.warn(`[guardian-check] Option inconnue ignorée : ${token}`)
        break
    }
  }

  options.agents = options.agents.filter(Boolean)
  if (!options.agents.length) {
    throw new Error('Au moins un agent doit être spécifié (--agents a,b ou --agent a)')
  }

  return options
}

function printUsage() {
  console.log(`Usage :
  node ARKA_OS/ARKA_CORE/scripts/guardian/guardian-check-messages.mjs --agents pmo,core-archivist [options]

Options :
  --agents a,b,c    Liste d'agents (séparés par virgule). Obligatoire.
  --agent a         Ajoute un agent (répétable).
  --no-ack          Passe --no-ack à arkamsg pull.
  --no-mark         Passe --no-mark à arkamsg pull.
  --verbose         Passe --verbose à arkamsg pull.
  --dry-run         Journalise uniquement, n'exécute pas arkamsg.
`)
}

function spawnArkamsgPull(agent, options) {
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const args = ['exec', 'arkamsg', '--', 'pull', '--agent', agent]
  if (options.noAck) args.push('--no-ack')
  if (options.noMark) args.push('--no-mark')
  if (options.verbose) args.push('--verbose')

  return new Promise((resolve, reject) => {
    const child = spawn(npmCmd, args, { stdio: 'inherit', shell: false })
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`arkamsg pull (${agent}) a quitté avec le code ${code}`))
    })
    child.on('error', reject)
  })
}

export async function guardianCheckMessages(options) {
  for (const agent of options.agents) {
    console.log(`[guardian-check] Pull inbox → ${agent}`)
    if (options.dryRun) {
      continue
    }
    await spawnArkamsgPull(agent, options)
  }
}

async function main() {
  try {
    const options = parseArgs(process.argv)
    await guardianCheckMessages(options)
  } catch (err) {
    console.error('[guardian-check] Erreur :', err?.message || err)
    printUsage()
    process.exit(1)
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('guardian-check-messages.mjs')) {
  await main()
}
