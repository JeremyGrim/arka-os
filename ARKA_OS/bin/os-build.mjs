#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

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

async function dumpYaml(obj) {
  const script = 'require "yaml"; require "json"; data = JSON.parse(STDIN.read); yaml = YAML.dump(data); yaml.sub!(/^---\\s*\\n?/, ""); STDOUT.write(yaml)';
  const stdout = await runRuby(script, [], JSON.stringify(obj ?? {}));
  return stdout.endsWith('\n') ? stdout : `${stdout}\n`;
}

async function listYaml(dir, { recursive = false } = {}) {
  const entries = await fs.readdir(path.join(ROOT, dir), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (recursive) {
        files.push(...await listYaml(relative, { recursive }));
      }
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.yaml')) {
      files.push(relative);
    }
  }
  files.sort((a, b) => a.localeCompare(b));
  return files;
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function deepMerge(target, source) {
  if (Array.isArray(target) && Array.isArray(source)) {
    return clone(source);
  }
  if (isPlainObject(target) && isPlainObject(source)) {
    const result = { ...target };
    for (const [key, value] of Object.entries(source)) {
      if (result[key] !== undefined) {
        result[key] = deepMerge(result[key], value);
      } else {
        result[key] = clone(value);
      }
    }
    return result;
  }
  return clone(source);
}

async function mergeFiles(files) {
  let merged = {};
  for (const relative of files) {
    const absolute = path.join(ROOT, relative);
    const data = await parseYaml(absolute);
    merged = deepMerge(merged, data);
  }
  return merged;
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function writeYaml(filePath, data) {
  const yaml = await dumpYaml(data);
  await fs.writeFile(filePath, yaml, 'utf8');
}

(async () => {
  const coreFiles = [
    'ARKA_CORE/ARKORE00-INDEX.yaml',
    'ARKA_CORE/master-assembly.yaml',
    ...await listYaml('ARKA_CORE/bricks')
  ];

  const profilFiles = [
    'ARKA_PROFIL/PROFILES00-INDEX.yaml',
    'ARKA_PROFIL/master-profiles.yaml',
    ...await listYaml('ARKA_PROFIL/bricks')
  ];

  const agentFiles = [
    'ARKA_AGENT/AGENT00-INDEX.yaml',
    'ARKA_AGENT/master-agent.yaml',
    ...await listYaml('ARKA_AGENT/client/acme'),
    ...await listYaml('ARKA_AGENT/client/acme/experts', { recursive: true }),
    ...await listYaml('ARKA_AGENT/client/acme/wakeup', { recursive: true })
  ];

  const coreData = await mergeFiles(coreFiles);
  const profilData = await mergeFiles(profilFiles);
  const agentData = await mergeFiles(agentFiles);

  await ensureDir(path.join(ROOT, 'ARKA_CORE/build'));
  await ensureDir(path.join(ROOT, 'ARKA_PROFIL/build'));
  await ensureDir(path.join(ROOT, 'ARKA_AGENT/build'));
  await ensureDir(path.join(ROOT, 'build'));

  await writeYaml(path.join(ROOT, 'ARKA_CORE/build/core.assembly.yaml'), coreData);
  await writeYaml(path.join(ROOT, 'ARKA_PROFIL/build/profiles.bundle.yaml'), profilData);
  await writeYaml(path.join(ROOT, 'ARKA_AGENT/build/assembly.yaml'), agentData);

  await fs.copyFile(path.join(ROOT, 'ARKA_CORE/build/core.assembly.yaml'), path.join(ROOT, 'build/core.assembly.yaml'));
  await fs.copyFile(path.join(ROOT, 'ARKA_PROFIL/build/profiles.bundle.yaml'), path.join(ROOT, 'build/profiles.bundle.yaml'));
  await fs.copyFile(path.join(ROOT, 'ARKA_AGENT/build/assembly.yaml'), path.join(ROOT, 'build/assembly.yaml'));

  const outputs = [
    'build/core.assembly.yaml',
    'build/profiles.bundle.yaml',
    'build/assembly.yaml'
  ];
  console.log('✅ Build terminé');
  outputs.forEach((file) => console.log(file));
})();
