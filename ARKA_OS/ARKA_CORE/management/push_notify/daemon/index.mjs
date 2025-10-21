#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

import {
  openDatabase,
  acquireLease,
  refreshLease,
  releaseLease,
  withTransaction,
  NOTIFY_RUNTIME_ROOT,
} from '../lib/db.mjs';
import { computeBackoff } from '../lib/events.mjs';
import { ensureSession, hasSession, sendLine, sendLiteralLine } from '../lib/tmux.mjs';
import { loadOptionAContext } from '../lib/optionA.mjs';

const LOCK_FILE = path.join(NOTIFY_RUNTIME_ROOT, 'notify.lock');
const PID_FILE = path.join(NOTIFY_RUNTIME_ROOT, 'notify.pid');
const HEARTBEAT_INTERVAL_MS = 2000;
const POLL_INTERVAL_MS = 200;
const MAX_ATTEMPTS = 5;
const REPO_ROOT = process.env.ARKA_REPO_ROOT || process.cwd();
const ARKAMSG_PATH = path.resolve(
  REPO_ROOT,
  'ARKA_META/.system/Governance/bins/msg/arkamsg.mjs'
);
const SYSTEM_AGENT_ID = 'notify-daemon';
const STATUS_BLOCKED = 'BLOCKED';

let shouldStop = false;
let db;
let leaseTimer;
let optionAContext;

function writePidFile() {
  fs.writeFileSync(PID_FILE, String(process.pid));
}

function removePidFile() {
  try {
    fs.unlinkSync(PID_FILE);
  } catch (err) {
    if (err?.code !== 'ENOENT') {
      console.error('[notify-daemon] unable to remove PID file', err);
    }
  }
}

function acquireLock() {
  try {
    const fd = fs.openSync(LOCK_FILE, 'wx');
    fs.writeSync(fd, `${process.pid}\n`);
    fs.closeSync(fd);
  } catch (error) {
    if (error?.code === 'EEXIST') {
      throw new Error('notify-daemon déjà actif (lock présent)');
    }
    throw error;
  }
}

function releaseLock() {
  try {
    fs.unlinkSync(LOCK_FILE);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.error('[notify-daemon] lock cleanup failed', error);
    }
  }
}

function startLeaseHeartbeat() {
  leaseTimer = setInterval(() => {
    try {
      if (!refreshLease(db)) {
        console.error('[notify-daemon] heartbeat refusé, abandon');
        shouldStop = true;
      }
    } catch (error) {
      console.error('[notify-daemon] heartbeat error', error);
    }
  }, HEARTBEAT_INTERVAL_MS);
  leaseTimer.unref();
}

function normalize(value) {
  if (!value) return null;
  return String(value).trim().toLowerCase();
}

function hydrateEvent(row) {
  if (!row) return null;
  let metadata = null;
  let constraints = null;
  try {
    metadata = row.metadata_json ? JSON.parse(row.metadata_json) : null;
  } catch (error) {
    console.error(
      `[notify-daemon] metadata_json invalide pour ${row.message_id ?? row.id}: ${error.message}`
    );
  }
  try {
    constraints = row.constraints_json ? JSON.parse(row.constraints_json) : null;
  } catch (error) {
    console.error(
      `[notify-daemon] constraints_json invalide pour ${row.message_id ?? row.id}: ${error.message}`
    );
  }
  return { ...row, metadata, constraints };
}

function markRun(eventId, attempt, result, error, providerProfile) {
  db.prepare(
    `INSERT INTO notify_runs (event_id, attempt_no, started_at, ended_at, result, error, provider_profile)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(eventId, attempt, Date.now(), Date.now(), result, error, providerProfile);
}

function recordAction(eventId, action, target, details = null) {
  const payload = details ? JSON.stringify(details) : null;
  db.prepare(
    `INSERT INTO notify_actions (event_id, action, target, details_json, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(eventId, action, target ?? null, payload, Date.now());
}

function sendArkamsgMessage({ to, subject, body, from = SYSTEM_AGENT_ID, status = STATUS_BLOCKED, relatesTo, noNotify = false }) {
  if (!to) {
    throw new Error('destinataire arkamsg manquant');
  }
  const args = [
    ARKAMSG_PATH,
    'send',
    '--from',
    from,
    '--to',
    to,
    '--subject',
    subject,
    '--body',
    body,
    '--status',
    status,
  ];
  if (relatesTo) {
    args.push('--relates-to', relatesTo);
  }
  if (noNotify) {
    args.push('--no-notify');
  }
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`arkamsg send a échoué (to=${to})`);
  }
}

function formatReason(reason) {
  switch (reason) {
    case 'allowlist_reject':
      return 'session non autorisée (hors allow-list)';
    case 'missing_session':
      return 'session non active';
    default:
      return reason ?? 'motif inconnu';
  }
}

function sendReturnToSender(event, target, sender, escalationInfo, reason) {
  if (!sender?.id) {
    recordAction(event.id, 'return_to_sender_missing', target.session, {
      role: target.role,
      reason,
    });
    return;
  }

  const isoTs = new Date(event.ts).toISOString();
  const escalateLabel = escalationInfo?.role ?? 'N/A';
  const subject = 'Notification non livrée — session non active';
  const body = [
    `Votre notification **${event.message_id}** n'a pas été livrée : la session **${target.session}** (rôle **${target.role}**) ${formatReason(reason)}.`,
    `Action : le message est **bloqué**. Une escalade a été envoyée vers **${escalateLabel}**.`,
    `Contexte : projet **${target.project}**, provider **${target.provider}**, ts **${isoTs}**.`,
    `Pointeur d'origine : **${event.resource_pointer}**.`,
  ].join('\n');

  try {
    sendArkamsgMessage({
      to: sender.id,
      subject,
      body,
      relatesTo: event.message_id,
      noNotify: true,
    });
    recordAction(event.id, 'return_to_sender', sender.id, {
      role: target.role,
      session: target.session,
      escalated_to: escalateLabel,
      reason,
    });
  } catch (error) {
    console.error('[notify-daemon] retour expéditeur impossible', error);
    recordAction(event.id, 'return_to_sender_error', sender.id, {
      role: target.role,
      session: target.session,
      error: String(error?.message ?? error),
    });
  }
}

function sendEscalation(event, target, sender, escalationInfo, reason) {
  if (!escalationInfo) return;

  const isoTs = new Date(event.ts).toISOString();
  const subject = 'Escalade — session cible non active';
  const body = [
    `L'événement **${event.message_id}** destiné à **${target.role}/${target.session}** est **bloqué** (${formatReason(reason)}).`,
    `Expéditeur : **${sender?.id ?? 'inconnu'}**.`,
    `Pointeur : **${event.resource_pointer}**.`,
    'Merci de router ou d’activer la session, puis de relancer si nécessaire.',
    `Contexte : projet **${target.project}**, provider **${target.provider}**, ts **${isoTs}**.`,
  ].join('\n');

  const roleKey = normalize(escalationInfo.role);
  const notifyAllowed = optionAContext.roleHasActiveSession(escalationInfo.role);
  const actionName =
    roleKey === 'owner'
      ? 'escalation_owner'
      : roleKey === 'pmo'
        ? 'escalation_pmo'
        : 'escalation_other';

  try {
    sendArkamsgMessage({
      to: escalationInfo.agentId,
      subject,
      body,
      relatesTo: event.message_id,
      noNotify: !notifyAllowed,
    });
    recordAction(event.id, actionName, escalationInfo.agentId, {
      role: escalationInfo.role,
      session: target.session,
      sender: sender?.id ?? null,
      reason,
      notify_active: notifyAllowed,
    });
  } catch (error) {
    console.error('[notify-daemon] envoi escalade impossible', error);
    recordAction(event.id, `${actionName}_error`, escalationInfo.agentId, {
      role: escalationInfo.role,
      session: target.session,
      sender: sender?.id ?? null,
      reason,
      error: String(error?.message ?? error),
    });
  }
}

function handleBlockedEvent(event, target, sender, reason) {
  const attempts = event.attempts + 1;
  const now = Date.now();
  withTransaction(db, () => {
    db.prepare(
      `UPDATE notify_events
         SET state = 'failed',
             attempts = ?,
             next_attempt_at = NULL,
             updated_at = ?,
             error_last = ?
       WHERE id = ?`
    ).run(attempts, now, reason, event.id);
    markRun(
      event.id,
      attempts,
      'blocked',
      reason,
      target.provider ?? event.provider
    );
    recordAction(
      event.id,
      reason === 'allowlist_reject' ? 'allowlist_reject' : 'blocked_missing_session',
      target.session,
      {
        role: target.role,
        sender: sender?.id ?? null,
      }
    );
  });

  const escalationInfo = optionAContext.determineEscalationTarget(sender?.role);
  if (reason === 'missing_session' && optionAContext.shouldReturnToSender()) {
    sendReturnToSender(event, target, sender, escalationInfo, reason);
  }
  sendEscalation(event, target, sender, escalationInfo, reason);
}

function handleDeliveryError(event, error) {
  const attempts = event.attempts + 1;
  const backoff = computeBackoff(attempts - 1);
  const nextAttempt = Date.now() + backoff;
  const dead = attempts >= MAX_ATTEMPTS;
  withTransaction(db, () => {
    db.prepare(
      `UPDATE notify_events
         SET state = ?,
             attempts = ?,
             next_attempt_at = ?,
             updated_at = ?,
             error_last = ?
       WHERE id = ?`
    ).run(
      dead ? 'dead' : 'queued',
      attempts,
      dead ? null : nextAttempt,
      Date.now(),
      String(error?.message ?? error ?? 'unknown'),
      event.id
    );
    markRun(
      event.id,
      attempts,
      dead ? 'fail' : 'retry',
      String(error?.message ?? error),
      event.provider
    );
    if (dead) {
      db.prepare(
        `INSERT INTO notify_dead_letters (event_id, message_id, snapshot_json, cause, dead_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(event_id) DO UPDATE SET cause = excluded.cause, dead_at = excluded.dead_at`
      ).run(
        event.id,
        event.message_id,
        JSON.stringify(event),
        String(error?.message ?? error),
        Date.now()
      );
    }
  });
}

function formatRole(role) {
  if (!role) return 'Inconnu';
  return role.replace(/[^A-Za-z0-9]+/g, '-');
}

function deliverEvent(event, session, targetRole, senderRole) {
  const destToken = `@${formatRole(targetRole)}`;
  const senderToken = `@${formatRole(senderRole)}`;
  const pointerToken = `ptr:msg:${event.message_id}`;
  const line = `[Notification-Auto] ${destToken} — Message recu de ${senderToken} : ${pointerToken} — [Message-READ]`;
  sendLiteralLine(session, line);
  sendLine(session, null);
  sendLine(session, null);
}

function processEvent(event) {
  try {
    const target = optionAContext.resolveTarget(event);
    const sender = optionAContext.resolveSender(event);

    event.session = target.session;
    event.provider = target.provider ?? event.provider;
    event.project = target.project ?? event.project;
    event.session_prefix = target.sessionPrefix ?? event.session_prefix;

    if (!target.allowed) {
      handleBlockedEvent(event, target, sender, 'allowlist_reject');
      return;
    }

    const sessionExists = hasSession(target.session);
    if (!sessionExists && optionAContext.getAttachOnly()) {
      handleBlockedEvent(event, target, sender, 'missing_session');
      return;
    }
    if (!sessionExists) {
      ensureSession(target.session);
    }

    deliverEvent(event, target.session, target.role, sender?.role ?? sender?.id);
    withTransaction(db, () => {
      db.prepare(
        `UPDATE notify_events
         SET state = 'delivered',
             session = COALESCE(session, ?),
             delivered_at = ?,
             updated_at = ?,
             error_last = NULL
         WHERE id = ?`
      ).run(
        target.session,
        Date.now(),
        Date.now(),
        event.id
      );
      markRun(
        event.id,
        event.attempts + 1,
        'ok',
        null,
        target.provider ?? event.provider
      );
    });
  } catch (error) {
    handleDeliveryError(event, error);
  }
}

function fetchNextEvent() {
  const now = Date.now();
  const row = db
    .prepare(
      `SELECT *
         FROM notify_events
        WHERE state = 'queued'
          AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
        ORDER BY created_at ASC, id ASC
        LIMIT 1`
    )
    .get(now);
  return hydrateEvent(row);
}

function markDispatched(eventId) {
  db.prepare(
    `UPDATE notify_events
       SET state = 'dispatched',
           attempts = attempts + 1,
           updated_at = ?,
           next_attempt_at = NULL
     WHERE id = ?`
  ).run(Date.now(), eventId);
}

async function loop() {
  while (!shouldStop) {
    const event = fetchNextEvent();
    if (!event) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      continue;
    }
    markDispatched(event.id);
    const refreshed = refreshLease(db);
    if (!refreshed) {
      console.error('[notify-daemon] lease perdu pendant traitement');
      shouldStop = true;
      break;
    }
    processEvent(event);
  }
}

function setupSignals() {
  const stop = () => {
    shouldStop = true;
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

async function main() {
  fs.mkdirSync(NOTIFY_RUNTIME_ROOT, { recursive: true });
  acquireLock();
  writePidFile();
  setupSignals();
  db = openDatabase();
  if (!acquireLease(db, process.pid)) {
    throw new Error('Impossible de prendre la lease notify (déjà détenue)');
  }
  optionAContext = loadOptionAContext();
  startLeaseHeartbeat();
  await loop();
}

main()
  .catch((error) => {
    console.error('[notify-daemon] erreur fatale', error);
    process.exitCode = 1;
  })
  .finally(() => {
    if (leaseTimer) {
      clearInterval(leaseTimer);
    }
    if (db) {
      try {
        releaseLease(db);
        db.close();
      } catch (err) {
        console.error('[notify-daemon] fermeture base', err);
      }
    }
    releaseLock();
    removePidFile();
    process.exit();
  });
