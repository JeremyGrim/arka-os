import { execFileSync } from 'node:child_process';

const WSL_DISTRO = process.env.ARKA_WSL_DISTRO || 'Ubuntu';
const TMUX_USE_WSL =
  process.env.ARKA_TMUX_USE_WSL === '1' || process.platform === 'win32';
const DEFAULT_PANE = process.env.ARKA_NOTIFY_PANE || '0.0';

function execTmux(args, options = {}) {
  if (TMUX_USE_WSL) {
    return execFileSync('wsl', ['-d', WSL_DISTRO, '--', 'tmux', ...args], options);
  }
  return execFileSync('tmux', args, options);
}

function execTmuxString(args) {
  return execTmux(args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

function escapeTmux(value = '') {
  return value.replace(/(["\\`$])/g, '\\$1');
}

export function hasSession(session) {
  try {
    execTmux(['has-session', '-t', session], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function ensureSession(session) {
  try {
    execTmux(['has-session', '-t', session], { stdio: 'ignore' });
  } catch {
    execTmux(['new-session', '-d', '-s', session], { stdio: 'ignore' });
  }
}

export function getSessionActivity(session) {
  try {
    const output = execTmuxString([
      'display-message',
      '-p',
      '-t',
      session,
      '#{session_activity}',
    ]);
    const trimmed = output.trim();
    if (!trimmed) return null;
    const value = Number.parseInt(trimmed, 10);
    return Number.isNaN(value) ? null : value;
  } catch {
    return null;
  }
}

export function sendLine(session, line, pane = DEFAULT_PANE) {
  if (line === null || line === undefined) {
    execTmux(['send-keys', '-t', `${session}:${pane}`, 'Enter'], { stdio: 'ignore' });
    return;
  }
  const escaped = escapeTmux(line);
  execTmux(['send-keys', '-t', `${session}:${pane}`, '-l', '--', escaped], {
    stdio: 'ignore',
  });
  execTmux(['send-keys', '-t', `${session}:${pane}`, 'Enter'], { stdio: 'ignore' });
}

export function sendTextBlock(session, text, pane = DEFAULT_PANE) {
  const lines = (text ?? '').split(/\r?\n/);
  for (const line of lines) {
    sendLine(session, line, pane);
  }
  sendLine(session, '', pane);
}

export function sendLiteralLine(session, line, pane = DEFAULT_PANE) {
  const text = line ?? '';
  execTmux(['load-buffer', '-'], { input: text, encoding: 'utf8', stdio: ['pipe', 'ignore', 'ignore'] });
  execTmux(['paste-buffer', '-t', `${session}:${pane}`], { stdio: 'ignore' });
  execTmux(['send-keys', '-t', `${session}:${pane}`, 'Enter'], { stdio: 'ignore' });
}

export function capturePane(session, pane = DEFAULT_PANE, lines = 50) {
  return execTmuxString(['capture-pane', '-p', '-t', `${session}:${pane}`, '-S', `-${lines}`]);
}

export function getPaneInfo(session, pane = DEFAULT_PANE) {
  try {
    const message = execTmuxString([
      'display-message',
      '-p',
      '-t',
      `${session}:${pane}`,
      '#{pane_pid} #{pane_current_command}',
    ]);
    return message.trim();
  } catch (error) {
    return null;
  }
}

export { DEFAULT_PANE };
