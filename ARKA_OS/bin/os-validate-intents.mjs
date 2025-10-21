#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(process.cwd(), '.');

function rel(p) {
  return path.relative(ROOT, p).split(path.sep).join('/');
}

function parseYaml(filePath) {
  const raw = readFileSync(filePath, 'utf8');
  const content = spawnSync('ruby', [
    '-e',
    'require "yaml"; require "json"; data = YAML.safe_load(STDIN.read, permitted_classes: [], aliases: true) || {}; STDOUT.write(JSON.generate(data))'
  ], { input: raw });
  if (content.status !== 0) {
    throw new Error(`${rel(filePath)}: ruby parse failed`);
  }
  const text = content.stdout.toString('utf8');
  return text.length ? JSON.parse(text) : {};
}

function parseYamlSafe(filePath) {
  const data = parseYaml(filePath);
  return data ?? {};
}

function collectErrors() {
  const errors = [];
  const registryPath = path.join(ROOT, 'ARKA_CORE/bricks/ARKORE18-INTENTS-REGISTRY.yaml');
  const precondsPath = path.join(ROOT, 'ARKA_CORE/bricks/ARKORE19-PRECONDITIONS-DEFS.yaml');
  const capsPath = path.join(ROOT, 'ARKA_CORE/bricks/CAPAMAP01-CAPABILITY-MATRIX.yaml');
  const actionKeysPath = path.join(ROOT, 'ARKA_CORE/bricks/ARKORE12-ACTION-KEYS.yaml');
  const wakeupMatrixPath = path.join(ROOT, 'wakeup-intents.matrix.yaml');

  const registryDoc = parseYamlSafe(registryPath);
  const precondsDoc = parseYamlSafe(precondsPath);
  const capsDoc = parseYamlSafe(capsPath);
  const actionKeysDoc = parseYamlSafe(actionKeysPath);
  const wakeupDoc = parseYamlSafe(wakeupMatrixPath);

  const registry = registryDoc.registry ?? {};
  const preconditions = new Set(Object.keys(precondsDoc.definitions ?? {}));
  const capabilities = new Map();
  for (const entry of capsDoc.capabilities ?? []) {
    if (!entry?.capability) continue;
    capabilities.set(entry.capability, entry);
  }

  const actionExports = actionKeysDoc?.exports ?? {};
  const actionKeys = new Set(Object.keys(actionExports?.action_keys ?? {}));
  const router = actionExports?.intent_router ?? {};
  const routerKeys = new Set(Object.keys(router));

  const wakeupIntents = new Set();
  for (const row of wakeupDoc.matrix ?? []) {
    if (row?.default_intent) wakeupIntents.add(row.default_intent);
    for (const intent of row?.intents ?? []) {
      if (intent) wakeupIntents.add(intent);
    }
  }

  for (const [intent, meta] of Object.entries(registry)) {
    if (!meta?.action_key) {
      errors.push(`${intent}: action_key manquant dans ARKORE18`);
      continue;
    }
    if (!actionKeys.has(meta.action_key)) {
      errors.push(`${intent}: action_key ${meta.action_key} introuvable dans ARKORE12`);
    }
    const capabilityId = meta.capability;
    if (!capabilityId || !capabilities.has(capabilityId)) {
      errors.push(`${intent}: capability ${capabilityId ?? 'undefined'} absente de CAPAMAP01`);
    } else {
      const capEntry = capabilities.get(capabilityId);
      if (!Array.isArray(capEntry.intents) || !capEntry.intents.includes(intent)) {
        errors.push(`${intent}: capability ${capabilityId} ne référence pas cet intent`);
      }
      if (Array.isArray(meta.roles_allowed) && Array.isArray(capEntry.roles_allowed)) {
        for (const role of meta.roles_allowed) {
          if (!capEntry.roles_allowed.includes(role)) {
            errors.push(`${intent}: rôle ${role} non autorisé dans capability ${capabilityId}`);
          }
        }
      }
    }
    const rolesAllowed = meta.roles_allowed;
    if (!Array.isArray(rolesAllowed) || rolesAllowed.length === 0) {
      errors.push(`${intent}: roles_allowed vide`);
    }
    const preconds = meta.preconditions ?? [];
    for (const prereq of preconds) {
      if (!preconditions.has(prereq)) {
        errors.push(`${intent}: prérequis ${prereq} non défini dans ARKORE19`);
      }
    }
    if (!routerKeys.has(intent)) {
      errors.push(`${intent}: absent du intent_router ARKORE12`);
    } else if (router[intent] !== meta.action_key) {
      errors.push(`${intent}: intent_router pointe vers ${router[intent]}, attendu ${meta.action_key}`);
    }
  }

  for (const intent of wakeupIntents) {
    if (!registry[intent]) {
      errors.push(`wakeup intents: ${intent} non défini dans ARKORE18`);
    }
  }

  return errors;
}

async function main() {
  try {
    const errors = collectErrors();
    if (errors.length > 0) {
      for (const err of errors) {
        console.error(`❌ ${err}`);
      }
      process.exitCode = 1;
    } else {
      console.log('✅ intents registry aligné avec action keys, prérequis et wakeups');
    }
  } catch (error) {
    console.error(`❌ ${error.message}`);
    process.exitCode = 1;
  }
}

main();
