#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { openDatabase, ensureDirectories, withTransaction, NOTIFY_RUNTIME_ROOT } from '../lib/db.mjs';
import { makeMessageId, resolveSession, serializeConstraints, serializeMetadata } from '../lib/events.mjs';
import { capturePane, ensureSession, hasSession, sendLine } from '../lib/tmux.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PID_FILE = path.join(NOTIFY_RUNTIME_ROOT, 'notify.pid');
const LOCK_FILE = path.join(NOTIFY_RUNTIME_ROOT, 'notify.lock');
const DAEMON_PATH = path.resolve(__dirname, '../daemon/index.mjs');
const STATUS_WINDOW_MS = 60_000;
const ERROR_WINDOW_MS = 3_600_000;
const DEFAULT_PROJECT = 'arka-labs-b';
const DEFAULT_PROVIDER = 'codex';
const DEFAULT_SESSION_PREFIX = 'arka';

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '0s';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  if (minutes > 0) {
    return `${minutes}m${seconds % 60}s`;
  }
  return `${seconds}s`;
}

function readPid() {
  try {
    const content = fs.readFileSync(PID_FILE, 'utf8').trim();
    return Number.parseInt(content, 10);
  } catch {
    return null;
  }
}

function isProcessAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function assertDaemonStopped() {
  const pid = readPid();
  if (pid && isProcessAlive(pid)) {
    throw new Error(`notify-daemon déjà actif (pid=${pid})`);
  }
  if (fs.existsSync(LOCK_FILE)) {
    throw new Error('Fichier de lock présent. Exécuter `notify down --force` si le daemon est tombé.');
  }
}

function cmdUp() {
  assertDaemonStopped();
  ensureDirectories();
  const child = spawn(process.execPath, [DAEMON_PATH], {
    detached: true,
    stdio: 'ignore',
    env: process.env,
  });
  child.unref();
  console.log('notify-daemon démarré (détaché)');
}

function cmdDown(force = false) {
  const pid = readPid();
  if (pid && isProcessAlive(pid)) {
    process.kill(pid, 'SIGTERM');
    console.log(`Signal SIGTERM envoyé à ${pid}`);
    return;
  }
  if (force) {
    try {
      fs.unlinkSync(PID_FILE);
    } catch {}
    try {
      fs.unlinkSync(LOCK_FILE);
    } catch {}
    console.log('Lock/PID supprimés manuellement.');
  } else {
    console.log('Aucun daemon actif.');
  }
}

function cmdStatus() {
  const db = openDatabase();
  const now = Date.now();
  const oldest = db
    .prepare(
      `SELECT MIN(created_at) AS created_at
         FROM notify_events
        WHERE state = 'queued'`
    )
    .get();
  const lagMs = oldest?.created_at ? now - oldest.created_at : 0;
  const delivered = db
    .prepare(
      `SELECT COUNT(*) AS total
         FROM notify_events
        WHERE state = 'delivered'
          AND delivered_at >= ?`
    )
    .get(now - STATUS_WINDOW_MS).total;
  const failures = db
    .prepare(
      `SELECT COUNT(*) AS total
         FROM notify_events
        WHERE state IN ('failed', 'dead')
          AND updated_at >= ?`
    )
    .get(now - ERROR_WINDOW_MS).total;
  const lease = db
    .prepare('SELECT holder_pid, holder_host, heartbeat_at FROM notify_leases WHERE lease_id = ?')
    .get('primary');
  const pid = readPid();
  console.log(`notify-daemon: ${pid && isProcessAlive(pid) ? `actif (pid ${pid})` : 'arrêté'}`);
  console.log(`lag: ${formatDuration(lagMs)} | débit(1min): ${delivered} | erreurs(1h): ${failures}`);
  if (lease) {
    const age = now - (lease.heartbeat_at ?? 0);
    console.log(`lease: pid=${lease.holder_pid} host=${lease.holder_host} (age ${formatDuration(age)})`);
  } else {
    console.log('lease: aucune');
  }

  const ONE_HOUR = 3_600_000;
  const ONE_DAY = 86_400_000;
  const actionCount = (action, windowMs) =>
    db
      .prepare(
        `SELECT COUNT(*) AS total
           FROM notify_actions
          WHERE action = ?
            AND created_at >= ?`
      )
      .get(action, now - windowMs).total;

  const blockedHour = actionCount('blocked_missing_session', ONE_HOUR);
  const blockedDay = actionCount('blocked_missing_session', ONE_DAY);
  const allowlistHour = actionCount('allowlist_reject', ONE_HOUR);
  const allowlistDay = actionCount('allowlist_reject', ONE_DAY);
  const rtsHour = actionCount('return_to_sender', ONE_HOUR);
  const rtsDay = actionCount('return_to_sender', ONE_DAY);
  const escPmoHour = actionCount('escalation_pmo', ONE_HOUR);
  const escPmoDay = actionCount('escalation_pmo', ONE_DAY);
  const escOwnerHour = actionCount('escalation_owner', ONE_HOUR);
  const escOwnerDay = actionCount('escalation_owner', ONE_DAY);

  console.log(
    `[option-a] blocked_missing_session: 1h=${blockedHour} 24h=${blockedDay} | allowlist_reject: 1h=${allowlistHour} 24h=${allowlistDay}`
  );
  console.log(
    `[option-a] return_to_sender: 1h=${rtsHour} 24h=${rtsDay} | escalation_pmo: 1h=${escPmoHour} 24h=${escPmoDay} | escalation_owner: 1h=${escOwnerHour} 24h=${escOwnerDay}`
  );

  const parseDetails = (json) => {
    if (!json) return {};
    try {
      return JSON.parse(json) ?? {};
    } catch {
      return {};
    }
  };

  const lastBlocked = db
    .prepare(
      `SELECT e.message_id, a.target, a.details_json, a.created_at
         FROM notify_actions a
         JOIN notify_events e ON e.id = a.event_id
        WHERE a.action = 'blocked_missing_session'
        ORDER BY a.created_at DESC
        LIMIT 5`
    )
    .all();

  if (lastBlocked.length) {
    console.log('[option-a] Derniers missing_session :');
    for (const item of lastBlocked) {
      const details = parseDetails(item.details_json);
      const sender = details.sender ?? 'inconnu';
      const role = details.role ?? 'N/A';
      const tsIso = new Date(item.created_at).toISOString();
      console.log(
        ` - ${item.message_id} → ${item.target ?? '?'} (rôle ${role}, sender ${sender}, ts ${tsIso})`
      );
    }
  }

  db.close();
}

function enqueueEvent(db, event) {
  const now = Date.now();
  const stmt = db.prepare(
    `INSERT INTO notify_events (
      message_id, type, v, ts, project, to_agent, session, provider,
      session_prefix, resource_pointer, constraints_json, metadata_json,
      state, attempts, next_attempt_at, error_last, created_at, updated_at, delivered_at
    )
    VALUES (@message_id, @type, @v, @ts, @project, @to_agent, @session, @provider,
            @session_prefix, @resource_pointer, @constraints_json, @metadata_json,
            'queued', 0, NULL, NULL, @created_at, @updated_at, NULL)`
  );
  stmt.run({
    message_id: event.message_id,
    type: 'notify',
    v: 1,
    ts: event.ts,
    project: event.project ?? null,
    to_agent: event.to_agent ?? null,
    session: event.session ?? null,
    provider: event.provider,
    session_prefix: event.session_prefix,
    resource_pointer: event.resource_pointer,
    constraints_json: serializeConstraints(event.constraints),
    metadata_json: serializeMetadata(event.metadata),
    created_at: now,
    updated_at: now,
  });
}

function cmdEnqueue(options) {
  const { project, toAgent, session, provider, sessionPrefix, pointer } = options;
  if (!pointer) {
    throw new Error('--pointer est requis');
  }
  if (!session && (!project || !toAgent)) {
    throw new Error('fournir --session ou --project + --to-agent');
  }
  const db = openDatabase();
  const messageId = makeMessageId();
  withTransaction(db, () => {
    enqueueEvent(db, {
      message_id: messageId,
      ts: Date.now(),
      project,
      to_agent: toAgent,
      session,
      provider,
      session_prefix: sessionPrefix || 'arka',
      resource_pointer: pointer,
      metadata: options.metadata,
      constraints: options.constraints,
    });
  });
  db.close();
  console.log(`Événement ${messageId} enregistré.`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForState(db, messageId, { acceptStates, rejectStates = [], timeoutMs = 120_000 }) {
  const desired = new Set(acceptStates ?? []);
  const rejected = new Set(rejectStates ?? []);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const row = db
      .prepare('SELECT * FROM notify_events WHERE message_id = ?')
      .get(messageId);
    if (row) {
      if (desired.has(row.state)) {
        return row;
      }
      if (rejected.has(row.state)) {
        const error = new Error(`état inattendu: ${row.state}`);
        error.event = row;
        throw error;
      }
    }
    await sleep(200);
  }
  throw new Error('timeout attente état');
}

function fetchActions(db, eventId) {
  return db
    .prepare(
      `SELECT action, target, details_json
         FROM notify_actions
        WHERE event_id = ?`
    )
    .all(eventId);
}

async function waitForOptionAActions(db, eventId, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const actions = fetchActions(db, eventId);
    const hasBlocked = actions.some((entry) => entry.action === 'blocked_missing_session');
    const hasReturn = actions.some((entry) =>
      ['return_to_sender', 'return_to_sender_missing'].includes(entry.action)
    );
    const hasEscalation = actions.some((entry) =>
      ['escalation_pmo', 'escalation_owner', 'escalation_other'].includes(entry.action)
    );
    if (hasBlocked && hasReturn && hasEscalation) {
      return { actions, hasBlocked, hasReturn, hasEscalation };
    }
    await sleep(200);
  }
  const actions = fetchActions(db, eventId);
  const hasBlocked = actions.some((entry) => entry.action === 'blocked_missing_session');
  const hasReturn = actions.some((entry) =>
    ['return_to_sender', 'return_to_sender_missing'].includes(entry.action)
  );
  const hasEscalation = actions.some((entry) =>
    ['escalation_pmo', 'escalation_owner', 'escalation_other'].includes(entry.action)
  );
  return { actions, hasBlocked, hasReturn, hasEscalation };
}

async function runDoctorBaseline(options = {}) {
  const db = openDatabase();
  const messageId = makeMessageId();
  const project = options.project ?? DEFAULT_PROJECT;
  const agent = options.toAgent ?? 'lead-dev-batisseur';
  const provider = options.provider ?? DEFAULT_PROVIDER;
  const sessionPrefix = options.sessionPrefix ?? DEFAULT_SESSION_PREFIX;
  const pointer = `arkamsg://doctor/${messageId}`;
  const senderAlias = options.sender ?? 'doctor-baseline';
  withTransaction(db, () => {
    enqueueEvent(db, {
      message_id: messageId,
      ts: Date.now(),
      project,
      to_agent: agent,
      session: null,
      provider,
      session_prefix: sessionPrefix,
      resource_pointer: pointer,
      metadata: { doctor: true, scenario: 'baseline', sender: senderAlias },
    });
  });
  try {
    const delivery = await waitForState(db, messageId, {
      acceptStates: ['delivered'],
      rejectStates: ['dead', 'failed'],
    });
    const session = resolveSession({
      session: delivery.session,
      project: delivery.project ?? project,
      to_agent: delivery.to_agent ?? agent,
      provider: delivery.provider ?? provider,
      session_prefix: delivery.session_prefix ?? sessionPrefix,
    });
    ensureSession(session);
    await sleep(500);
    const pane = capturePane(session, undefined, 80);
    const stripAnsi = (input) => input.replace(/\u001B\[[0-9;]*m/g, '');
    const sanitized = stripAnsi(pane);
    const expectedToken = `ptr:msg:${messageId}`;
    const pattern = new RegExp(
      String.raw`\[Notification-Auto\][\s\S]*${expectedToken}[\s\S]*\[Message-READ\]`
    );
    if (!pattern.test(sanitized)) {
      throw new Error('notification non détectée dans tmux (format Notification-Auto absent).');
    }
    console.log(`Doctor PASS (${messageId})`);
  } catch (error) {
    console.error(`Doctor FAIL (${messageId}): ${error.message}`);
    process.exitCode = 1;
  } finally {
    db.close();
  }
}

async function runDoctorOptionA(options) {
  const db = openDatabase();
  const messageId = makeMessageId();
  const project = options.project ?? DEFAULT_PROJECT;
  const provider = options.provider ?? DEFAULT_PROVIDER;
  const sessionPrefix = options.sessionPrefix ?? DEFAULT_SESSION_PREFIX;
  const role = options.role ?? 'FSX';
  const toAgent = options.toAgent ?? 'fsx-extreme-fullstack';
  const senderAgent = options.sender ?? 'doctor-optiona';
  const pointer = `arkamsg://doctor-option-a/${messageId}`;

  const targetSession = resolveSession({
    session: null,
    project,
    to_agent: role,
    provider,
    session_prefix: sessionPrefix,
  });

  if (hasSession(targetSession)) {
    throw new Error(
      `La session ${targetSession} est active. Ferme-la avant d'exécuter le doctor Option A.`
    );
  }

  withTransaction(db, () => {
    enqueueEvent(db, {
      message_id: messageId,
      ts: Date.now(),
      project,
      to_agent: toAgent,
      session: null,
      provider,
      session_prefix: sessionPrefix,
      resource_pointer: pointer,
      metadata: { doctor: true, scenario: 'option-a', sender: senderAgent },
    });
  });

  try {
    const failed = await waitForState(db, messageId, {
      acceptStates: ['failed'],
      rejectStates: ['delivered', 'dead'],
    });
    if (failed.error_last !== 'missing_session') {
      throw new Error(
        `état attendu 'missing_session', obtenu '${failed.error_last ?? 'inconnu'}'`
      );
    }

    const { actions, hasBlocked, hasReturn, hasEscalation } = await waitForOptionAActions(
      db,
      failed.id
    );

    if (!hasBlocked) {
      throw new Error('aucune trace blocked_missing_session dans notify_actions');
    }

    if (!hasReturn) {
      throw new Error('aucun retour expéditeur détecté pour Option A');
    }

    if (!hasEscalation) {
      throw new Error("aucune escalade enregistrée (PMO/Owner) pour Option A");
    }

    console.log(
      `Doctor Option A PASS (${messageId}) — state=missing_session, actions=${actions.length}`
    );
  } catch (error) {
    console.error(`Doctor Option A FAIL (${messageId}): ${error.message}`);
    process.exitCode = 1;
  } finally {
    db.close();
  }
}

async function cmdDoctor(options) {
  const scenarioRaw = options.scenario;
  const scenario =
    typeof scenarioRaw === 'string'
      ? scenarioRaw.toLowerCase()
      : scenarioRaw === true
        ? 'option-a'
        : 'baseline';

  if (scenario === 'option-a' || scenario === 'missing-session') {
    await runDoctorOptionA(options);
  } else {
    await runDoctorBaseline(options);
  }
}

function parseArgs(argv) {
  const [, , command, ...rest] = argv;
  const options = {};
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const value = rest[i + 1]?.startsWith('--') || rest[i + 1] === undefined ? true : rest[++i];
    options[key.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
  }
  return { command, options };
}

async function main() {
  const { command, options } = parseArgs(process.argv);
  try {
    switch (command) {
      case 'up':
        cmdUp();
        break;
      case 'down':
        cmdDown(options.force === true || options.force === 'true');
        break;
      case 'status':
        cmdStatus();
        break;
      case 'doctor':
        await cmdDoctor(options);
        break;
      case 'enqueue':
        cmdEnqueue({
          project: options.project,
          toAgent: options.toAgent,
          session: options.session,
          provider: options.provider || 'codex',
          sessionPrefix: options.sessionPrefix || 'arka',
          pointer: options.pointer,
          metadata: options.metadata ? JSON.parse(options.metadata) : undefined,
          constraints: options.constraints ? JSON.parse(options.constraints) : undefined,
        });
        break;
      default:
        console.log(`Usage:
  notify up
  notify down [--force]
  notify status
  notify doctor [--scenario baseline|option-a]
  notify enqueue --pointer <arkamsg://...> [--project X --to-agent Y | --session Z] [--provider codex]`);
        process.exitCode = 1;
    }
  } catch (error) {
    console.error('[notify]', error.message);
    process.exitCode = 1;
  }
}

main();
