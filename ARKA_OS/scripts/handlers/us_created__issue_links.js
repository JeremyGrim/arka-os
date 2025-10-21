#!/usr/bin/env node
/**
 * Handler US_CREATED → crée un ticket GitHub.
 * Exige GITHUB_REPO="owner/repo" et GITHUB_TOKEN (PAT repo scope).
 */
import fs from 'node:fs';
import { argv, env, exit } from 'node:process';

const handlerId = 'us_created__issue_links';
const now = () => new Date().toISOString();

const stdin = fs.readFileSync(0, 'utf8');
let event;
try {
  event = stdin.trim() ? JSON.parse(stdin) : {};
} catch (error) {
  log('error', 'Payload JSON invalide', { error: error.message });
  exit(1);
}

const eventName = event?.event ?? 'UNKNOWN_EVENT';

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

const providerFlagIndex = argv.indexOf('--provider');
const provider = providerFlagIndex !== -1 ? argv[providerFlagIndex + 1] : 'github';
if (provider !== 'github') {
  log('error', 'Provider non supporté', { provider });
  exit(2);
}

const repo = env.GITHUB_REPO;
const token = env.GITHUB_TOKEN;
if (!repo || !token) {
  const missing = [!repo && 'GITHUB_REPO', !token && 'GITHUB_TOKEN'].filter(Boolean);
  log('error', 'Variables d’environnement manquantes', { missing });
  exit(3);
}

const [owner, repoName] = repo.split('/');
if (!owner || !repoName) {
  log('error', 'Format GITHUB_REPO invalide', { repo });
  exit(4);
}

const issueUrl = `https://api.github.com/repos/${owner}/${repoName}/issues`;
const title = `${event?.scope?.usId ?? 'US'} — ${event?.details?.title ?? 'Nouvelle User Story'}`;
const bodyLines = [
  'Auto-created from ARKA event **US_CREATED**',
  `Scope: ${JSON.stringify(event?.scope ?? {}, null, 2)}`
];
if (event?.details?.summary) {
  bodyLines.push('', 'Summary:', event.details.summary);
}

log('info', 'Création du ticket GitHub', {
  repo,
  url: issueUrl,
  us_id: event?.scope?.usId ?? null
});

const response = await fetch(issueUrl, {
  method: 'POST',
  headers: {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    title,
    body: bodyLines.join('\n'),
    labels: ['US']
  })
});

if (!response.ok) {
  const text = await response.text();
  log('error', 'Échec de création du ticket GitHub', {
    status: response.status,
    response: text.slice(0, 512)
  });
  exit(5);
}

const created = await response.json();
log('info', 'Ticket GitHub créé', {
  issue_number: created?.number ?? null,
  html_url: created?.html_url ?? null
});
