import crypto from 'node:crypto';

const BACKOFF_MS = [0, 1000, 2000, 5000, 10000];

export function resolveSession(event, options = {}) {
  if (event.session && event.session.trim().length > 0) {
    return event.session.trim();
  }

  const sessionPrefix =
    event.session_prefix ??
    options.sessionPrefix ??
    options.session_prefix ??
    'arka';
  const project = event.project ?? options.project ?? options.defaultProject;
  const provider = event.provider ?? options.provider ?? options.defaultProvider;
  const toAgent =
    event.to_agent ?? options.to_agent ?? options.defaultToAgent;

  if (!project || !toAgent) {
    throw new Error('project et to_agent requis pour construire la session');
  }

  const suffix = provider ? `${toAgent}-${provider}` : toAgent;
  return `${sessionPrefix}-${project}-${suffix}`;
}

export function makeMessageId() {
  return `msg-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

export function computeBackoff(attempts) {
  const index = Math.min(attempts, BACKOFF_MS.length - 1);
  return BACKOFF_MS[index];
}

export function serializeConstraints(constraints) {
  return constraints?.length ? JSON.stringify(constraints) : null;
}

export function serializeMetadata(metadata) {
  return metadata && Object.keys(metadata).length ? JSON.stringify(metadata) : null;
}

export { BACKOFF_MS };
