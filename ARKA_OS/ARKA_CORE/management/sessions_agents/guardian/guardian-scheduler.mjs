#!/usr/bin/env node
/**
 * Guardian messaging scheduler
 * Lance automatiquement des messages stricts arka-execute-orders vers une liste d'agents
 * à une heure donnée, avec répétition optionnelle (ex. nightly sweep pour la team Guardian).
 * Peut enchaîner un contrôle de messagerie (guardian-check-messages) avant l'exécution si désiré.
 *
 * Usage :
 *   node ARKA_OS/ARKA_CORE/scripts/guardian/guardian-scheduler.mjs --time "23:30" --agents core-archivist,arka-scribe \
 *     --from core-archivist --subject "Nightly Guardian Sweep" \
 *     --body-file docs/nightly-guardian.txt --repeat daily
 *
 * Options principales :
 *   --time HH:MM             Heure locale du déclenchement (24h). Obligatoire.
 *   --agents a,b,c           Liste d'agents destinataires (séparés par virgule). Obligatoire.
 *   --from agent             Agent émetteur (défaut : core-archivist).
 *   --project id             Identifiant projet (défaut : arka-labs-b).
 *   --provider provider      Provider (défaut : codex).
 *   --session-prefix prefix  Préfixe sessions tmux (défaut : arka).
 *   --subject text           Sujet du message (défaut générique).
 *   --body "ligne1\nligne2"  Corps du message ; sinon --body-file path ou corps par défaut.
 *   --body-file path         Fichier texte (UTF-8) à utiliser comme corps.
 *   --repeat daily           Replanifie automatiquement toutes les 24h (sinon exécution unique).
 *   --notify-dry-run         Ajoute --notify-dry-run aux envois (pour test sans exécution réelle).
 *   --dry-run                N'envoie rien, journalise uniquement.
 *
 * Dépend de npm exec arkamsg et du pipeline notify (ou fallback tmux via arkamsg).
 */

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import yaml from 'yaml'
import { guardianCheckMessages } from './guardian-check-messages.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const DEFAULT_TEMPLATE_PATH = path.resolve(__dirname, '..', '..', 'templates', 'new-msg-execut-workflow.yaml')

const DEFAULT_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone
const DEFAULT_PROJECT = process.env.ARKA_PROJECT_ID || 'arka-labs-b'
const DEFAULT_PROVIDER = process.env.ARKA_PROVIDER || 'codex'
const DEFAULT_SESSION_PREFIX = process.env.ARKA_SESSION_PREFIX || 'arka'
const DEFAULT_FROM_AGENT = 'core-archivist'
const DEFAULT_SUBJECT = 'Nightly Guardian Sweep'
const DEFAULT_BODY = [
  '1. Ack ce message.',
  '2. Controle ta messagerie (guardian-check-messages) et consigne les résultats.',
  '3. Résous les messages strict en attente (ack/system).',
  '4. Range/optimise les dossiers gouvernance & mémoire (ARKORE20).',
  '5. Dépose un rapport de clôture dans ton outbox.'
].join('\n')

const repeatModes = new Set(['daily', 'none', undefined, null])

function parseArgs(argv) {
  const args = argv.slice(2)
  const options = {
    agents: [],
    time: null,
    from: DEFAULT_FROM_AGENT,
    project: DEFAULT_PROJECT,
    provider: DEFAULT_PROVIDER,
    sessionPrefix: DEFAULT_SESSION_PREFIX,
    subject: DEFAULT_SUBJECT,
    body: null,
    bodyFile: null,
    repeat: 'none',
    notifyDryRun: false,
    dryRun: false,
    checkBefore: true,
    checkNoAck: false,
    checkNoMark: false,
    checkVerbose: false,
    template: null
  }

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i]
    const next = () => args[++i]

    switch (token) {
      case '--time':
        options.time = next()
        break
      case '--agent':
        options.agents.push(next())
        break
      case '--agents':
        options.agents.push(...(next() || '').split(',').map((s) => s.trim()).filter(Boolean))
        break
      case '--from':
        options.from = next()
        break
      case '--project':
        options.project = next()
        break
      case '--provider':
        options.provider = next()
        break
      case '--session-prefix':
        options.sessionPrefix = next()
        break
      case '--subject':
        options.subject = next()
        break
      case '--body':
        options.body = next()
        break
      case '--body-file':
        options.bodyFile = next()
        break
      case '--repeat':
        options.repeat = next()
        break
      case '--notify-dry-run':
        options.notifyDryRun = true
        break
      case '--dry-run':
        options.dryRun = true
        break
      case '--skip-check':
        options.checkBefore = false
        break
      case '--check-no-ack':
        options.checkNoAck = true
        break
      case '--check-no-mark':
        options.checkNoMark = true
        break
      case '--check-verbose':
        options.checkVerbose = true
        break
      case '--template':
        options.template = next()
        break
      case '--help':
      case '-h':
        printUsage()
        process.exit(0)
        break
      default:
        console.warn(`[guardian-scheduler] Option inconnue ignorée : ${token}`)
        break
    }
  }

  if (!options.time) {
    throw new Error('Argument --time HH:MM obligatoire (heure locale)')
  }
  if (!options.agents.length) {
    throw new Error('Au moins un agent doit être spécifié (--agents a,b ou --agent a)')
  }

  if (!repeatModes.has(options.repeat)) {
    throw new Error(`Valeur --repeat invalide : ${options.repeat} (supporte daily|none)`)
  }
  if (options.repeat === undefined || options.repeat === null) {
    options.repeat = 'none'
  }

  return options
}

function printUsage() {
  console.log(`Usage :
  node ARKA_OS/ARKA_CORE/scripts/guardian/guardian-scheduler.mjs --time "23:30" --agents core-archivist,arka-scribe \\
    [--project arka-labs-b] [--provider codex] [--session-prefix arka] \\
    [--from core-archivist] [--subject "..."] [--body "..."] [--body-file fichier] [--template chemin] \\
    [--repeat daily] [--notify-dry-run] [--dry-run]

Options :
  --time HH:MM             Heure locale (24h). Obligatoire.
  --agents a,b,c           Liste d'agents (séparés par virgule). Obligatoire.
  --agent a                Ajoute un agent (répétable).
  --from agent             Agent émetteur (défaut : core-archivist).
  --subject texte          Sujet du message (défaut : Nightly Guardian Sweep).
  --body texte             Corps du message (sinon --body-file ou corps par défaut).
  --body-file chemin       Lit le corps dans un fichier texte UTF-8.
  --project id             Identifiant projet (défaut : arka-labs-b).
  --provider provider      Provider (défaut : codex).
  --session-prefix prefix  Préfixe sessions tmux (défaut : arka).
  --repeat daily           Replanifie toutes les 24h (sinon exécution unique).
  --skip-check             Ne lance pas guardian-check-messages avant l'envoi.
  --check-no-ack           Passe --no-ack au contrôle de messagerie.
  --check-no-mark          Passe --no-mark au contrôle de messagerie.
  --check-verbose          Passe --verbose au contrôle de messagerie.
  --template chemin        Utilise un template YAML spécifique pour le message strict.
  --notify-dry-run         Ajoute --notify-dry-run aux envois (test sans exécution).
  --dry-run                Journalise uniquement sans envoyer.
`)
}

function resolveBaseContent(options) {
  if (options.body) {
    return options.body
  }
  if (options.bodyFile) {
    if (!options._bodyFileCache) {
      const fullPath = path.resolve(options.bodyFile)
      options._bodyFileCache = fs.readFileSync(fullPath, 'utf-8')
      options._bodyFilePath = fullPath
    }
    return options._bodyFileCache
  }
  const templatePath = options.template
    ? path.resolve(options.template)
    : DEFAULT_TEMPLATE_PATH
  if (!options._templateCache || options._templatePath !== templatePath) {
    try {
      const raw = fs.readFileSync(templatePath, 'utf-8')
      const parsed = yaml.parse(raw)
      const message = parsed?.message ?? parsed
      const body = message?.body ?? ''
      options._templateCache = body || DEFAULT_BODY
      options._templatePath = templatePath
      options._templateMeta = message ?? {}
    } catch (err) {
      console.warn(
        `[guardian-scheduler] Template introuvable ou invalide (${templatePath}) : ${err?.message || err}`
      )
      options._templateCache = DEFAULT_BODY
      options._templatePath = 'DEFAULT_BODY'
      options._templateMeta = null
    }
  }
  if (typeof options._templateCache !== 'string') {
    options._templateCache = String(options._templateCache ?? '')
  }
  return options._templateCache
}

function renderTemplate(content, placeholders) {
  return content.replace(/{{(\w+)}}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(placeholders, key)) {
      return String(placeholders[key])
    }
    return match
  })
}

function buildBodyForAgent(agent, options) {
  const baseContent = resolveBaseContent(options)
  const nowIso = new Date().toISOString()
  const placeholders = {
    agent_id: agent,
    from_agent: options.from,
    project_id: options.project,
    provider: options.provider,
    session_prefix: options.sessionPrefix,
    timestamp: nowIso,
    now: nowIso
  }
  return renderTemplate(baseContent, placeholders)
}

function parseTimeToDate(timeString) {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(timeString)
  if (!match) {
    throw new Error(`Format --time invalide : ${timeString} (HH:MM attendu)`)
  }
  const [, hoursStr, minutesStr] = match
  const hours = Number.parseInt(hoursStr, 10)
  const minutes = Number.parseInt(minutesStr, 10)

  const now = new Date()
  const target = new Date(now)
  target.setHours(hours, minutes, 0, 0)

  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1)
  }

  return target
}

function humanDuration(ms) {
  const totalSeconds = Math.round(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const parts = []
  if (hours) parts.push(`${hours}h`)
  if (minutes) parts.push(`${minutes}m`)
  if (!hours && !minutes) parts.push(`${seconds}s`)
  return parts.join(' ')
}

function scheduleNextRun(options, firstRun = true) {
  const targetDate = parseTimeToDate(options.time)
  const delay = targetDate.getTime() - Date.now()
  const when = targetDate.toLocaleString(undefined, { timeZone: DEFAULT_TIMEZONE })

  console.log(
    `[guardian-scheduler] ${firstRun ? 'Planification' : 'Nouvelle planification'} à ${when} (${humanDuration(
      delay
    )})`
  )

  setTimeout(async () => {
    try {
      await dispatchNightlyRun(options)
    } catch (err) {
      console.error('[guardian-scheduler] Erreur lors de l’envoi :', err?.message || err)
    }
    if (options.repeat === 'daily') {
      scheduleNextRun(options, false)
    } else {
      console.log('[guardian-scheduler] Exécution terminée, fin du scheduler.')
      process.exit(0)
    }
  }, delay)
}

function spawnArkamsgSend(payload, options) {
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const args = [
    'exec',
    'arkamsg',
    '--',
    'send',
    '--from',
    payload.from,
    '--to',
    payload.to,
    '--subject',
    payload.subject,
    '--body',
    payload.body,
    '--project',
    payload.project,
    '--provider',
    payload.provider,
    '--session-prefix',
    payload.sessionPrefix,
    '--ack-policy',
    'system'
  ]

  if (options.notifyDryRun) {
    args.push('--notify-dry-run')
  }
  if (payload.messageId) {
    args.push('--message-id', payload.messageId)
  }

  return new Promise((resolve, reject) => {
    const child = spawn(npmCmd, args, { stdio: 'inherit', shell: false })
    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`npm exec arkamsg exit code ${code}`))
      }
    })
    child.on('error', reject)
  })
}

async function dispatchNightlyRun(options) {\n  const timestamp = new Date().toISOString()\n  console.log(`[guardian-scheduler] Déclenchement ${timestamp} vers ${options.agents.join(', ')}`)\n\n  if (!options.body && !options.bodyFile) {\n    const templatePath = options.template\n      ? path.resolve(options.template)\n      : DEFAULT_TEMPLATE_PATH\n    if (!options._templateLogged) {\n      console.log(`[guardian-scheduler] Template utilisé : ${templatePath}`)\n      options._templateLogged = true\n    }\n  } else if (options.bodyFile && !options._bodyPathLogged) {\n    const fullPath = options._bodyFilePath || path.resolve(options.bodyFile)\n    console.log(`[guardian-scheduler] Corps depuis fichier : ${fullPath}`)\n    options._bodyPathLogged = true\n  }\n\n  if (options.checkBefore) {
    console.log('[guardian-scheduler] Contrôle messagerie préalable…')
    await guardianCheckMessages({
      agents: options.agents,
      noAck: options.checkNoAck,
      noMark: options.checkNoMark,
      verbose: options.checkVerbose,
      dryRun: options.dryRun
    })
  }

  if (options.dryRun) {
    for (const agent of options.agents) {
      const preview = buildBodyForAgent(agent, options)
      console.log(
        `[guardian-scheduler] [dry-run] Enverrait strict -> ${agent} (from ${options.from})`
      )
      console.log(preview.split(/
/)[0])
    }
    return
  }

  for (const agent of options.agents) {
    const body = buildBodyForAgent(agent, options)
    const payload = {
      from: options.from,
      to: agent,
      subject: options.subject,
      body,
      project: options.project,
      provider: options.provider,
      sessionPrefix: options.sessionPrefix
    }
    console.log(`[guardian-scheduler] Envoi strict vers ${agent}…`)
    await spawnArkamsgSend(payload, options)
  }
}

async function main() {
  try {
    const options = parseArgs(process.argv)
    console.log('[guardian-scheduler] Timezone locale :', DEFAULT_TIMEZONE)
    scheduleNextRun(options, true)
  } catch (err) {
    console.error('[guardian-scheduler] Erreur :', err?.message || err)
    printUsage()
    process.exit(1)
  }
}

await main()
