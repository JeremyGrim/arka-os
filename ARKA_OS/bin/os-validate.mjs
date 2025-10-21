#!/usr/bin/env node
import { constants as fsConstants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const errors = [];
const warnings = [];

let actionSets = {};
let pathSets = {};
let denySets = {};
let rights = {};
let profilesCatalog = {};
let masterAgent = {};
const wakeups = [];
const experts = new Map();
let coreEventBus = null;
let clientEventsPack = null;

const IGNORE_DIRS = new Set(['.git', 'node_modules', '.logs', '.mem']);

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      await walk(fullPath);
    } else if (entry.isFile() && /\.ya?ml$/i.test(entry.name)) {
      await loadYaml(fullPath);
    }
  }
}

function rel(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join('/');
}

function detectDuplicateKeys(content) {
  const duplicates = [];
  const contextKeys = new Map();
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const rawIndent = line.match(/^ */)[0].length;
    let trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    let effectiveIndent = rawIndent;
    let isListItem = false;
    if (trimmed.startsWith('- ')) {
      isListItem = true;
      trimmed = trimmed.slice(2).trimStart();
      effectiveIndent = rawIndent + 2;
    }

    for (const level of Array.from(contextKeys.keys())) {
      if (level > effectiveIndent) contextKeys.delete(level);
    }
    if (isListItem) {
      contextKeys.delete(effectiveIndent);
    }

    const match = trimmed.match(/^([A-Za-z0-9_-]+):/);
    if (!match) continue;
    const key = match[1];
    let set = contextKeys.get(effectiveIndent);
    if (!set) {
      set = new Set();
      contextKeys.set(effectiveIndent, set);
    }
    if (set.has(key)) {
      duplicates.push({ key, indent: effectiveIndent });
    } else {
      set.add(key);
    }
  }
  return duplicates;
}

function runRuby(script, args = [], input) {
  return new Promise((resolve, reject) => {
    const child = spawn('ruby', ['-e', script, ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr || `ruby exit ${code}`));
      }
    });
    if (input) {
      child.stdin.write(input);
    }
    child.stdin.end();
  });
}

async function parseYaml(filePath) {
  let content = await fs.readFile(filePath, 'utf8');
  const marker = content.indexOf('\n## ');
  let trimmed = marker !== -1 ? content.slice(0, marker) : content;
  trimmed = trimmed.replace(/:\s*\{/g, ': {');
  const script = 'require "yaml"; require "json"; input = STDIN.read; data = YAML.safe_load(input, permitted_classes: [Time], aliases: true) || {}; STDOUT.write(JSON.generate(data))';
  try {
    const stdout = await runRuby(script, [], trimmed);
    return stdout ? JSON.parse(stdout) : {};
  } catch (error) {
    throw new Error(`${filePath}: ${error.message}`);
  }
}

async function loadYaml(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  const relative = rel(filePath);
  detectDuplicateKeys(content).forEach(({ key }) => {
    errors.push(`${relative}: clé dupliquée "${key}"`);
  });
  let data;
  try {
    data = await parseYaml(filePath);
  } catch (error) {
    errors.push(`${relative}: échec de parsing Ruby (${error.message.trim().split('\n')[0]})`);
    return;
  }

  switch (relative) {
    case 'ARKA_PROFIL/bricks/ARKPR03-ACTION-SETS.yaml':
      actionSets = data?.exports?.action_sets ?? {};
      break;
    case 'ARKA_PROFIL/bricks/ARKPR04-PATH-SETS.yaml':
      pathSets = data?.exports?.path_sets ?? {};
      denySets = data?.exports?.deny_sets ?? {};
      break;
    case 'ARKA_PROFIL/bricks/ARKPR05-RIGHTS.yaml':
      rights = data?.exports?.rights ?? {};
      break;
    case 'ARKA_PROFIL/bricks/ARKPR08-PROFILES-CATALOG.yaml':
      profilesCatalog = data?.exports ?? {};
      break;
    case 'ARKA_AGENT/master-agent.yaml':
      masterAgent = data;
      break;
    case 'ARKA_CORE/bricks/ARKORE16-EVENT-BUS.yaml':
      coreEventBus = data;
      break;
    case 'ARKA_AGENT/client/acme/ARKAA12-EVENTS-PACK.yaml':
      clientEventsPack = data;
      break;
    default:
      break;
  }

  if (relative.startsWith('ARKA_AGENT/client/acme/wakeup/')) {
    wakeups.push({ relative, data });
  }
  if (relative.startsWith('ARKA_AGENT/client/acme/experts/')) {
    experts.set(relative, data);
  }
}

function ensure(condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

function resolveProfileRef(ref) {
  if (typeof ref !== 'string') return null;
  const [fileRef, pathRef] = ref.split(':');
  if (fileRef !== 'ARKPR08-PROFILES-CATALOG' || !pathRef) return null;
  const parts = pathRef.split('.');
  let current = profilesCatalog;
  for (const part of parts) {
    if (current && Object.prototype.hasOwnProperty.call(current, part)) {
      current = current[part];
    } else {
      return null;
    }
  }
  return { value: current, key: parts.at(-1) };
}

function collectMatrix() {
  const rows = [];
  for (const { relative, data } of wakeups) {
    const agentId = data?.agent_id;
    const profileRef = data?.use_profile_ref;
    const profile = resolveProfileRef(profileRef);
    const expertRef = data?.expert_ref;
    const expertPath = typeof expertRef === 'string' ? `ARKA_AGENT/${expertRef}`.replace(/\\/g, '/') : null;
    const expertData = expertPath ? experts.get(expertPath) : undefined;
    const intents = Array.isArray(expertData?.available_intents) ? [...expertData.available_intents] : [];
    intents.sort();
    rows.push({
      agent_id: agentId,
      wakeup_file: relative,
      profile_ref: profileRef,
      profile: profile?.key ?? null,
      expert_file: expertPath ?? null,
      default_intent: data?.startup?.default_intent ?? null,
      intents
    });
  }
  rows.sort((a, b) => (a.agent_id ?? '').localeCompare(b.agent_id ?? ''));
  return rows;
}

async function ensureHandlerExists(baseDir, run, context) {
  const fullPath = path.resolve(ROOT, baseDir, run);
  try {
    await fs.access(fullPath, fsConstants.X_OK);
  } catch (error) {
    errors.push(`${context}: handler introuvable ou non exécutable -> ${rel(fullPath)}`);
  }
}

function validateRights() {
  ensure(actionSets.create_structure, 'ARKPR03-ACTION-SETS.yaml: action_set create_structure absent');
  for (const [rightKey, rightValue] of Object.entries(rights)) {
    const sets = rightValue?.action_sets ?? [];
    sets.forEach((set) => {
      ensure(actionSets[set], `ARKPR05-RIGHTS.yaml: action_set inconnu "${set}" utilisé par ${rightKey}`);
    });
    (rightValue?.allow_paths ?? []).forEach((pathKey) => {
      ensure(pathSets[pathKey], `ARKPR05-RIGHTS.yaml: allow_paths inconnu "${pathKey}" pour ${rightKey}`);
    });
    (rightValue?.deny_paths ?? []).forEach((pathKey) => {
      ensure(denySets[pathKey], `ARKPR05-RIGHTS.yaml: deny_paths inconnu "${pathKey}" pour ${rightKey}`);
    });
  }
}

function validateProfiles() {
  const profiles = profilesCatalog?.profiles ?? {};
  for (const [profileKey, profileValue] of Object.entries(profiles)) {
    if (profileValue?.rights && !rights[profileValue.rights]) {
      errors.push(`ARKPR08-PROFILES-CATALOG.yaml: profil ${profileKey} référence un droit inconnu ${profileValue.rights}`);
    }
    if (profileValue?.right_ref) {
      const ref = profileValue.right_ref;
      const [fileRef, key] = ref.split(':');
      if (fileRef !== 'ARKPR05-RIGHTS' || !key) {
        errors.push(`ARKPR08-PROFILES-CATALOG.yaml: profil ${profileKey} right_ref invalide ${ref}`);
      } else if (!rights[key.split('.').pop()]) {
        errors.push(`ARKPR08-PROFILES-CATALOG.yaml: profil ${profileKey} right_ref cible inconnue ${ref}`);
      }
    }
  }
}

function validateWakeups() {
  const seenAgents = new Set();
  for (const { relative, data } of wakeups) {
    const agentId = data?.agent_id;
    const profileRef = data?.use_profile_ref;
    const expertRef = data?.expert_ref;
    if (!agentId) {
      errors.push(`${relative}: agent_id absent`);
    } else if (seenAgents.has(agentId)) {
      errors.push(`${relative}: agent_id dupliqué (${agentId})`);
    } else {
      seenAgents.add(agentId);
    }
    const profile = resolveProfileRef(profileRef);
    if (!profile) {
      errors.push(`${relative}: use_profile_ref invalide (${profileRef ?? 'null'})`);
    }
    if (typeof expertRef === 'string') {
      const expertPath = `ARKA_AGENT/${expertRef}`.replace(/\\/g, '/');
      if (!experts.has(expertPath)) {
        errors.push(`${relative}: expert_ref introuvable (${expertRef})`);
      }
    } else {
      errors.push(`${relative}: expert_ref invalide (${expertRef ?? 'null'})`);
    }
  }
}

async function validateEventHandlers() {
  if (coreEventBus?.override || !coreEventBus?.dispatch) return;
  const baseDir = coreEventBus?.dispatch?.local?.base_dir;
  if (typeof baseDir !== 'string' || !baseDir.length) {
    errors.push('ARKORE16-EVENT-BUS.yaml: dispatch.local.base_dir manquant');
  }
  for (const sub of coreEventBus?.subscriptions ?? []) {
    if (sub?.using === 'local' && sub?.run) {
      await ensureHandlerExists(baseDir ?? '', sub.run, 'ARKORE16-EVENT-BUS.yaml');
    }
  }
  if (clientEventsPack) {
    const clientBaseDir = clientEventsPack?.override?.ARKORE16-EVENT-BUS?.dispatch?.local?.base_dir
      ?? clientEventsPack?.dispatch?.local?.base_dir;
    const subs = clientEventsPack?.override?.ARKORE16-EVENT-BUS?.subscriptions
      ?? clientEventsPack?.subscriptions
      ?? [];
    for (const sub of subs) {
      if (sub?.using === 'local' && sub?.run) {
        await ensureHandlerExists(clientBaseDir ?? baseDir ?? '', sub.run, 'ARKAA12-EVENTS-PACK.yaml');
      }
    }
  }
}

function validateMasterAgent() {
  const enable = masterAgent?.profiles?.default?.enable ?? [];
  const seen = new Set();
  for (const ref of enable) {
    if (seen.has(ref)) {
      errors.push(`master-agent.yaml: entrée enable dupliquée (${ref})`);
    }
    seen.add(ref);
  }
}

function formatScalar(value) {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) {
    return `[${value.map((v) => formatScalar(v)).join(', ')}]`;
  }
  if (typeof value === 'string') {
    return /^[A-Za-z0-9_.@\-\/]+$/.test(value) ? value : JSON.stringify(value);
  }
  return JSON.stringify(value);
}

function toYaml(rows) {
  const lines = [
    'id: ARKA-WAKEUP-INTENTS-MATRIX',
    'version: 1.0.0',
    'generated_with: bin/generate-wakeup-matrix.mjs',
    'matrix:'
  ];
  for (const row of rows) {
    lines.push('  - agent_id: ' + formatScalar(row.agent_id));
    lines.push('    wakeup_file: ' + formatScalar(row.wakeup_file));
    lines.push('    profile_ref: ' + formatScalar(row.profile_ref));
    lines.push('    profile: ' + formatScalar(row.profile));
    lines.push('    expert_file: ' + formatScalar(row.expert_file));
    lines.push('    default_intent: ' + formatScalar(row.default_intent));
    lines.push('    intents: ' + formatScalar(row.intents));
  }
  return lines.join('\n') + '\n';
}

async function validateMatrix(rows) {
  const matrixPath = path.join(ROOT, 'wakeup-intents.matrix.yaml');
  const expected = toYaml(rows);
  try {
    const current = await fs.readFile(matrixPath, 'utf8');
    if (current.trim() !== expected.trim()) {
      errors.push('wakeup-intents.matrix.yaml: contenu obsolète, exécuter npm run build:matrix');
    }
  } catch (error) {
    errors.push('wakeup-intents.matrix.yaml: fichier manquant, exécuter npm run build:matrix');
  }
}

(async () => {
  await walk(ROOT);
  validateRights();
  validateProfiles();
  validateWakeups();
  validateMasterAgent();
  await validateEventHandlers();
  const matrixRows = collectMatrix();
  await validateMatrix(matrixRows);

  if (warnings.length) {
    warnings.forEach((w) => console.warn(`⚠️  ${w}`));
  }
  if (errors.length) {
    errors.forEach((err) => console.error(`❌ ${err}`));
    process.exit(1);
  }
  console.log('✅ Validation ARKA_OS réussie');
})();
