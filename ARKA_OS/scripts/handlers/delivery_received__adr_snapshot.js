#!/usr/bin/env node
/**
 * Handler DELIVERY_RECEIVED → archive un snapshot ADR dans .logs/delivery_received.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { exit } from 'node:process';

const handlerId = 'delivery_received__adr_snapshot';
const now = () => new Date().toISOString();

const stdin = await fs.readFile(0, 'utf8');
let event;
let eventName = 'UNKNOWN_EVENT';
try {
  event = stdin.trim() ? JSON.parse(stdin) : {};
  eventName = event?.event ?? eventName;
} catch (error) {
  log('error', 'Payload JSON invalide', { error: error.message });
  exit(1);
}

function log(level, msg, extra = {}) {
  const entry = {
    ts: now(),
    level,
    msg,
    handler: handlerId,
    event: eventName,
    trace_id: event?.trace_id ?? event?.traceId ?? null,
    ...extra
  };
  if (entry.trace_id === null) {
    delete entry.trace_id;
  }
  const serialized = JSON.stringify(entry);
  if (level === 'error') {
    console.error(serialized);
  } else {
    console.log(serialized);
  }
}

const snapshotDir = path.resolve('.logs', 'delivery_received');
await fs.mkdir(snapshotDir, { recursive: true });

const adrId = event?.details?.adr_id ?? event?.details?.adrId ?? event?.scope?.adrId ?? event?.scope?.usId ?? 'delivery';
const safeId = String(adrId).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 64) || 'delivery';
const snapshotName = `${safeId}-${Date.now()}.json`;
const snapshotPath = path.join(snapshotDir, snapshotName);

const snapshot = {
  captured_at: now(),
  adr_id: adrId,
  source: event?.source_brick ?? null,
  severity: event?.severity ?? null,
  details: event?.details ?? null
};

await fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf8');
log('info', 'Snapshot ADR archivé', { snapshot_path: snapshotPath, adr_id: adrId });
