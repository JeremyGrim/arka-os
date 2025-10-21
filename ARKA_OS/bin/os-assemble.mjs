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

(async () => {
  const profile = process.argv[2] ?? 'dev';
  const overridePath = `profiles/${profile}.override.yaml`;
  try {
    await fs.access(path.join(ROOT, overridePath));
  } catch {
    console.error(`Override introuvable: ${overridePath}`);
    process.exit(2);
  }

  const files = ['ARKA_CORE/master-assembly.yaml', overridePath];
  const extPath = 'ARKA_EXT/ARKAEXT01-SUBS-CI.yaml';
  try {
    await fs.access(path.join(ROOT, extPath));
    files.push(extPath);
  } catch {
    // optional
  }

  const merged = await mergeFiles(files);
  await fs.mkdir(path.join(ROOT, 'build'), { recursive: true });
  const yaml = await dumpYaml(merged);
  await fs.writeFile(path.join(ROOT, 'build/assembly.yaml'), yaml, 'utf8');
  console.error('✅ assembly écrit dans build/assembly.yaml');
})();
