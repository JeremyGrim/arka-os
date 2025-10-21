#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const wakeups = [];
const experts = new Map();
let profilesCatalog = {};

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
  const script = 'require "yaml"; require "json"; input = STDIN.read; data = YAML.safe_load(input, permitted_classes: [], aliases: true) || {}; STDOUT.write(JSON.generate(data))';
  try {
    const stdout = await runRuby(script, [], trimmed);
    return stdout ? JSON.parse(stdout) : {};
  } catch (error) {
    throw new Error(`${filePath}: ${error.message}`);
  }
}

async function loadYaml(filePath) {
  const relative = rel(filePath);
  const data = await parseYaml(filePath);
  if (relative === 'ARKA_PROFIL/bricks/ARKPR08-PROFILES-CATALOG.yaml') {
    profilesCatalog = data?.exports ?? {};
  }
  if (relative.startsWith('ARKA_AGENT/client/acme/wakeup/')) {
    wakeups.push({ relative, data });
  }
  if (relative.startsWith('ARKA_AGENT/client/acme/experts/')) {
    experts.set(relative, data);
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
  return parts.at(-1) ?? null;
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

function buildMatrix() {
  const rows = wakeups.map(({ relative, data }) => {
    const profileRef = data?.use_profile_ref;
    const expertRef = data?.expert_ref;
    const expertPath = typeof expertRef === 'string' ? `ARKA_AGENT/${expertRef}`.replace(/\\/g, '/') : null;
    const expertData = expertPath ? experts.get(expertPath) : undefined;
    const intents = Array.isArray(expertData?.available_intents) ? [...expertData.available_intents] : [];
    intents.sort();
    return {
      agent_id: data?.agent_id ?? null,
      wakeup_file: relative,
      profile_ref: profileRef ?? null,
      profile: resolveProfileRef(profileRef),
      expert_file: expertPath,
      default_intent: data?.startup?.default_intent ?? null,
      intents
    };
  });
  rows.sort((a, b) => (a.agent_id ?? '').localeCompare(b.agent_id ?? ''));
  return rows;
}

(async () => {
  await walk(ROOT);
  const matrix = buildMatrix();
  const yaml = toYaml(matrix);
  const target = path.join(ROOT, 'wakeup-intents.matrix.yaml');
  await fs.writeFile(target, yaml, 'utf8');
  console.log(`✅ wakeup-intents.matrix.yaml mis à jour (${matrix.length} agents)`);
})();
