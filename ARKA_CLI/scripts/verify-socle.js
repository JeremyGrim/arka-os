#!/usr/bin/env node
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const CLI_ENTRY = path.join(__dirname, '..', 'dist', 'main.js');

if (!fs.existsSync(CLI_ENTRY)) {
  console.error('dist/main.js introuvable. Exécutez `npm run build` avant la vérification.');
  process.exitCode = 1;
  return;
}

const ENV = { ...process.env, ARKA_SOCLE_URL: process.env.ARKA_SOCLE_URL || 'http://localhost:9090' };

function run(args) {
  console.log(`$ arka ${args.join(' ')}`);
  const output = execFileSync('node', [CLI_ENTRY, ...args], { env: ENV, encoding: 'utf-8' });
  console.log(output.trim());
  return output.toString();
}

function ensureJson(args) {
  const raw = run(args);
  return JSON.parse(raw);
}

(async () => {
  console.log('--- Vérification CLI ? SOCLE ---');
  console.log(`URL SOCLE : ${ENV.ARKA_SOCLE_URL}`);

  const status = ensureJson(['status', '--json']);
  if (!status?.socle?.status) {
    throw new Error('Réponse status invalide');
  }
  console.log('Status OK');

  // Création session
  const createOutput = run(['session', 'create', '--agent', 'agp', '--profile', 'governance', '--provider', 'claude']);
  const match = createOutput.match(/ID:\s+([\w-]+)/);
  if (!match) {
    throw new Error('Impossible de récupérer l\'ID de session');
  }
  const sessionId = match[1];
  console.log(`Session créée: ${sessionId}`);

  const list = ensureJson(['session', 'list', '--json']);
  if (!Array.isArray(list) || !list.find((s) => s.id === sessionId)) {
    throw new Error('Session absente du listing');
  }

  // Context push/pull
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arka-cli-'));
  const contextPath = path.join(tmpDir, 'context.yaml');
  fs.writeFileSync(contextPath, 'project:\n  id: PRJ-CLI\n  name: CLI Validation\n');
  run(['context', 'push', '--file', contextPath]);
  const context = run(['context', 'show']);
  if (!context.includes('PRJ-CLI')) {
    throw new Error('Context push non pris en compte');
  }

  // File inject
  const filePath = path.join(tmpDir, 'sample.txt');
  fs.writeFileSync(filePath, 'Hello from CLI ? SOCLE test');
  run(['file', 'inject', filePath, '--session', sessionId, '--type', 'input']);
  const files = ensureJson(['file', 'list', '--session', sessionId, '--json']);
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('Injection fichier non retrouvée');
  }

  // Diagnostics & report
  ensureJson(['report', '--json']);
  ensureJson(['diagnostics', '--json']);

  // Nettoyage session
  run(['session', 'end', sessionId]);

  console.log('? Vérification terminée avec succès');
})();
