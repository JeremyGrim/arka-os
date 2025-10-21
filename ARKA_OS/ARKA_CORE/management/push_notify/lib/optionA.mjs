import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

import { resolveSession } from './events.mjs';
import { hasSession, getSessionActivity } from './tmux.mjs';

const CONFIG_ROOT = path.resolve('ARKA_OS/ARKA_CORE/management/push_notify/config');
const POLICY_PATH = path.join(CONFIG_ROOT, 'policy.yaml');
const ALLOWLIST_PATH = path.join(CONFIG_ROOT, 'allowlist.yaml');

function readYaml(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`[optionA] Fichier ${label} introuvable (${filePath}).`);
  }
  const content = fs.readFileSync(filePath, 'utf8');
  try {
    return parseYaml(content) ?? {};
  } catch (error) {
    throw new Error(`[optionA] Lecture YAML impossible (${label}): ${error.message}`);
  }
}

function normalizeKey(value) {
  if (!value) return null;
  return String(value).trim().toLowerCase();
}

function pointerToAgent(pointer) {
  if (!pointer) return null;
  const match = String(pointer).match(/arkamsg:\/\/[^/]+\/([^/?#]+)/i);
  return match ? match[1] : null;
}

export class OptionAContext {
  constructor(policyRaw, allowlistRaw) {
    this.policy = this.normalizePolicy(policyRaw);
    this.allowlist = this.normalizeAllowlist(allowlistRaw);
  }

  static load() {
    const policyRaw = readYaml(POLICY_PATH, 'policy');
    const allowlistRaw = readYaml(ALLOWLIST_PATH, 'allowlist');
    return new OptionAContext(policyRaw, allowlistRaw);
  }

  normalizePolicy(policyRaw) {
    const policy = policyRaw ?? {};
    const escalation = policy.escalation_policy ?? {};
    const roleActivity = policy.role_activity ?? {};
    return {
      attachOnly: Boolean(policy.attach_only),
      projectDefault: policy.project ?? null,
      providerDefault: policy.provider_default ?? null,
      sessionPrefixDefault: policy.session_prefix_default ?? null,
      onMissingSession: (policy.on_missing_session ?? 'block').toLowerCase(),
      notifyReturnToSender: policy.notify_return_to_sender !== false,
      escalation: {
        default: escalation.default ?? null,
        fallback: escalation.if_sender_is_PMO_or_PMO_inactive ?? null,
        pmoInactiveAfterSec: escalation.pmo_inactive_after_sec ?? null,
      },
      roleActivity: {
        source: (roleActivity.source ?? 'tmux').toLowerCase(),
        inactiveThresholdSec: roleActivity.inactive_threshold_sec ?? null,
      },
      routingPointers: policy.routing_pointers ?? {},
    };
  }

  normalizeAllowlist(raw) {
    const aliases = new Map();
    const roleSessions = new Map();
    const sessionToRole = new Map();
    const allowedSessions = new Set();

    const rawRoles = raw?.roles ?? {};
    for (const [roleName, data] of Object.entries(rawRoles)) {
      const canonicalRole = String(roleName);
      aliases.set(normalizeKey(roleName), canonicalRole);
      const sessions = Array.isArray(data?.sessions) ? data.sessions : [];
      roleSessions.set(
        canonicalRole,
        new Set(
          sessions
            .map((session) => String(session).trim())
            .filter((session) => session.length > 0)
        )
      );
      for (const session of sessions) {
        const trimmed = String(session).trim();
        if (!trimmed) continue;
        allowedSessions.add(trimmed);
        sessionToRole.set(trimmed, canonicalRole);
      }
    }

    const rawAliases = raw?.aliases ?? {};
    for (const [alias, targetRole] of Object.entries(rawAliases)) {
      const normalized = normalizeKey(alias);
      if (!normalized) continue;
      aliases.set(normalized, String(targetRole));
    }

    return {
      aliases,
      roleSessions,
      sessionToRole,
      allowedSessions,
    };
  }

  getAttachOnly() {
    return this.policy.attachOnly;
  }

  shouldReturnToSender() {
    return this.policy.notifyReturnToSender;
  }

  resolveRole(identifier) {
    if (!identifier) return null;
    const normalized = normalizeKey(identifier);
    if (!normalized) return null;
    return this.allowlist.aliases.get(normalized) ?? String(identifier);
  }

  resolveTarget(event) {
    const project = event.project ?? this.policy.projectDefault;
    let provider = event.provider ?? this.policy.providerDefault;
    let sessionPrefix = event.session_prefix ?? this.policy.sessionPrefixDefault ?? 'arka';

    if (!provider) provider = 'codex';

    let session = event.session?.trim();
    let role = null;
    let aliasApplied = false;

    if (session) {
      role = this.allowlist.sessionToRole.get(session) ?? this.resolveRole(event.to_agent);
    } else {
      const toAgentRaw = event.to_agent;
      const resolvedRole = this.resolveRole(toAgentRaw);
      aliasApplied = resolvedRole !== toAgentRaw && resolvedRole !== null;
      role = resolvedRole ?? toAgentRaw;
      if (!project || !role) {
        throw new Error('project et to_agent requis pour construire la session');
      }
      session = resolveSession(
        {
          session: null,
          session_prefix: sessionPrefix,
          project,
          to_agent: role,
          provider,
        },
        { allowAliases: false }
      );
    }

    if (!session) {
      throw new Error('Session cible introuvable');
    }

    const allowed = this.allowlist.allowedSessions.has(session);
    if (!role) {
      role =
        this.allowlist.sessionToRole.get(session) ??
        this.resolveRole(event.to_agent) ??
        event.to_agent ??
        'Inconnu';
    }

    return {
      session,
      role,
      project,
      provider,
      sessionPrefix,
      aliasApplied,
      allowed,
    };
  }

  hasActiveSession(session) {
    return hasSession(session);
  }

  roleHasActiveSession(roleName) {
    if (!roleName) return false;
    const sessions = this.allowlist.roleSessions.get(roleName);
    if (!sessions) return false;
    for (const session of sessions) {
      if (hasSession(session)) {
        return true;
      }
    }
    return false;
  }

  isRoleInactive(roleName) {
    if (!roleName) return true;
    if (this.policy.roleActivity.source !== 'tmux') return false;
    const threshold = this.policy.roleActivity.inactiveThresholdSec;
    if (!threshold) return false;
    const sessions = this.allowlist.roleSessions.get(roleName);
    if (!sessions || sessions.size === 0) {
      return true;
    }
    const nowSeconds = Math.floor(Date.now() / 1000);
    let anySessionActive = false;
    for (const session of sessions) {
      if (!hasSession(session)) {
        continue;
      }
      anySessionActive = true;
      const activity = getSessionActivity(session);
      if (typeof activity === 'number' && activity > 0) {
        if (nowSeconds - activity <= threshold) {
          return false;
        }
      }
    }
    return !anySessionActive || threshold > 0;
  }

  routingForRole(roleName) {
    if (!roleName) return null;
    const pointer = this.policy.routingPointers?.[roleName];
    if (!pointer) return null;
    const agentId = pointerToAgent(pointer);
    if (!agentId) return null;
    return { pointer, agentId, role: roleName };
  }

  resolveSender(event) {
    const metadata = event.metadata ?? {};
    const sender =
      event.sender ??
      metadata.sender ??
      metadata.from ??
      metadata.emitter ??
      null;
    if (!sender) {
      return { id: null, role: null };
    }
    const role = this.resolveRole(sender);
    return { id: String(sender), role };
  }

  determineEscalationTarget(senderRole) {
    const escalation = this.policy.escalation;
    let targetRole = escalation.default ?? null;
    if (!targetRole) return null;

    const fallbackRole = escalation.fallback ?? targetRole;
    const normalizedSenderRole = senderRole ? String(senderRole) : null;

    if (
      normalizedSenderRole &&
      normalizeKey(normalizedSenderRole) === normalizeKey(targetRole)
    ) {
      targetRole = fallbackRole;
    } else if (
      normalizeKey(targetRole) === 'pmo' &&
      escalation.pmoInactiveAfterSec
    ) {
      const inactive = this.isRoleInactive('PMO');
      if (inactive) {
        targetRole = fallbackRole;
      }
    }

    return this.routingForRole(targetRole);
  }
}

export function loadOptionAContext() {
  return OptionAContext.load();
}
