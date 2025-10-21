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

function loadDocs() {
  const registry = parseYaml(path.join(ROOT, 'ARKA_CORE/bricks/ARKORE18-INTENTS-REGISTRY.yaml'));
  const wakeupMatrix = parseYaml(path.join(ROOT, 'wakeup-intents.matrix.yaml'));
  return { registry, wakeupMatrix };
}

function lint() {
  const errors = [];
  const { registry, wakeupMatrix } = loadDocs();
  const intents = new Set(Object.keys(registry.registry ?? {}));
  for (const row of wakeupMatrix.matrix ?? []) {
    const context = row.agent_id ?? row.profile ?? 'unknown-agent';
    const defaultIntent = row.default_intent;
    if (defaultIntent && !intents.has(defaultIntent)) {
      errors.push(`${context}: default_intent ${defaultIntent} absent du registre`);
    }
    for (const intent of row.intents ?? []) {
      if (!intents.has(intent)) {
        errors.push(`${context}: intent ${intent} absent du registre`);
      }
    }
  }
  return errors;
}

try {
  const errors = lint();
  if (errors.length > 0) {
    for (const err of errors) {
      console.error(`❌ ${err}`);
    }
    process.exitCode = 1;
  } else {
    console.log('✅ wakeup matrix alignée avec ARKORE18');
  }
} catch (error) {
  console.error(`❌ ${error.message}`);
  process.exitCode = 1;
}
