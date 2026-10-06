import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const MAX_WALK_DEPTH = 10;
const MAX_DIRECTORY_SCAN = 48;

/**
 * Dev/browser local scan — same discovery shape as src-tauri/src/discover.rs
 * so Vite (:1420) and desktop Tauri share one project-picker experience.
 */
export function scanLocalProjects(cwd = process.cwd()) {
  const candidates = new Map();

  for (const { root, php } of runningFrameworkRoots()) {
    remember(candidates, root, true, php);
  }
  for (const root of nearbyFrameworkRoots(cwd)) {
    remember(candidates, root, false, 'php');
  }

  const projects = [...candidates.values()]
    .map((candidate) => inspectFrameworkRoot(candidate.root, candidate.running, candidate.phpBinary))
    .filter(Boolean);
  projects.sort((left, right) => {
    if (left.running !== right.running) return left.running ? -1 : 1;
    return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
  });
  return projects;
}

function remember(candidates, root, running, phpBinary) {
  const key = canonicalKey(root);
  const entry = candidates.get(key) ?? { root, running: false, phpBinary: 'php' };
  entry.running ||= running;
  if (running && phpBinary && phpBinary !== 'php') entry.phpBinary = phpBinary;
  candidates.set(key, entry);
}

function nearbyFrameworkRoots(cwd) {
  const roots = [];
  const configured = process.env.WELINE_FRAMEWORK_ROOT;
  if (configured) pushIfFramework(roots, configured);

  const current = path.resolve(cwd);
  const nearest = nearestFrameworkRoot(current);
  if (nearest) roots.push(nearest);
  const parent = path.dirname(current);
  pushIfFramework(roots, path.join(parent, '框架'));
  scanChildren(roots, parent, 1);
  pushIfFramework(roots, path.join(current, '框架'));
  scanChildren(roots, current, 1);

  const home = os.homedir();
  if (home) {
    scanChildren(roots, path.join(home, 'Project'), 2);
    scanChildren(roots, path.join(home, 'Projects'), 2);
  }
  return roots;
}

function scanChildren(roots, dir, remainingDepth) {
  if (remainingDepth <= 0 || roots.length >= MAX_DIRECTORY_SCAN) return;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (roots.length >= MAX_DIRECTORY_SCAN) break;
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    pushIfFramework(roots, full);
    if (remainingDepth > 1) scanChildren(roots, full, remainingDepth - 1);
  }
}

function pushIfFramework(roots, candidate) {
  if (fs.existsSync(path.join(candidate, 'bin', 'w'))) roots.push(candidate);
}

function nearestFrameworkRoot(start) {
  let current = path.resolve(start);
  for (let i = 0; i < MAX_WALK_DEPTH; i += 1) {
    if (fs.existsSync(path.join(current, 'bin', 'w'))) return canonicalize(current);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function runningFrameworkRoots() {
  try {
    const stdout = execFileSync('ps', ['-ax', '-o', 'command='], {
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    });
    const found = [];
    for (const line of stdout.split('\n')) {
      const command = line.trim();
      if (!looksLikeWelineProcess(command)) continue;
      const cwdMatch = command.match(/(?:^|\s)(\/[^\s]+?)(?:\/bin\/w|\s)/);
      const start = cwdMatch?.[1];
      if (!start) continue;
      const root = nearestFrameworkRoot(start);
      if (root) found.push({ root, php: command.includes('php') ? 'php' : 'php' });
    }
    return found;
  } catch {
    return [];
  }
}

function looksLikeWelineProcess(command) {
  const lower = command.toLowerCase();
  return (
    lower.includes('bin/w')
    || lower.includes('weline')
    || lower.includes('wls')
    || (lower.includes('php') && lower.includes('server:start'))
  );
}

function inspectFrameworkRoot(root, running, phpBinary) {
  if (!fs.existsSync(path.join(root, 'bin', 'w'))) return null;
  const resolved = canonicalize(root);
  const env = parseEnvPhp(resolved);
  const name = path.basename(resolved) || 'Weline';
  return {
    name,
    frameworkRoot: resolved,
    phpBinary: phpBinary || 'php',
    githubRepository: githubFromGitConfig(resolved),
    adminUrl: env.adminUrl,
    siteUrls: env.siteUrls,
    running: Boolean(running),
    source: running ? 'running' : 'nearby',
  };
}

function parseEnvPhp(root) {
  let text = '';
  try {
    text = fs.readFileSync(path.join(root, 'app', 'etc', 'env.php'), 'utf8');
  } catch {
    return { adminUrl: null, siteUrls: [] };
  }
  const host = phpSectionString(text, 'wls', 'host');
  const port = phpSectionInt(text, 'wls', 'port') ?? 80;
  const prefix = phpSectionString(text, 'backend', 'prefix');
  const siteUrls = [];
  let adminUrl = null;
  if (host) {
    const origin = publicSiteOrigin(host, port);
    siteUrls.push(origin);
    adminUrl = joinWlsPanelPath(origin, prefix);
  }
  return { adminUrl, siteUrls };
}

function publicSiteOrigin(host, port) {
  if (host === '127.0.0.1' || host === 'localhost' || host === '::1') {
    return port === 80 ? `http://${host}` : `http://${host}:${port}`;
  }
  if (host.includes('.')) return `https://${host}`;
  return port === 80 ? `http://${host}` : `http://${host}:${port}`;
}

function joinWlsPanelPath(origin, prefix) {
  let pathUrl = origin.replace(/\/+$/, '');
  if (prefix) pathUrl += `/${String(prefix).replace(/^\/+|\/+$/g, '')}`;
  if (!pathUrl.includes('/server/backend/wls-panel')) pathUrl += '/server/backend/wls-panel';
  return pathUrl;
}

function phpSectionString(source, section, key) {
  const offset = phpSectionOffset(source, section);
  if (offset < 0) return null;
  return phpString(source.slice(offset), `'${key}'`);
}

function phpSectionInt(source, section, key) {
  const offset = phpSectionOffset(source, section);
  if (offset < 0) return null;
  const haystack = source.slice(offset);
  const needle = `'${key}'`;
  const at = haystack.indexOf(needle);
  if (at < 0) return null;
  const rest = haystack.slice(at + needle.length).replace(/^\s*=>\s*/, '');
  const digits = rest.match(/^\d+/);
  return digits ? Number(digits[0]) : null;
}

function phpSectionOffset(source, section) {
  const a = source.indexOf(`'${section}' =>`);
  if (a >= 0) return a;
  return source.indexOf(`"${section}" =>`);
}

function phpString(source, key) {
  const start = source.indexOf(key);
  if (start < 0) return null;
  return quotedStringAfter(source.slice(start + key.length));
}

function quotedStringAfter(source) {
  const rest = source.replace(/^\s*=>\s*/, '').trimStart();
  const quote = rest[0];
  if (quote !== "'" && quote !== '"') return null;
  const end = rest.indexOf(quote, 1);
  if (end < 0) return null;
  const value = rest.slice(1, end).trim();
  return value || null;
}

function githubFromGitConfig(root) {
  let text = '';
  try {
    text = fs.readFileSync(path.join(root, '.git', 'config'), 'utf8');
  } catch {
    return null;
  }
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    const url = trimmed.startsWith('url = ')
      ? trimmed.slice(6).trim()
      : trimmed.startsWith('url=')
        ? trimmed.slice(4).trim()
        : null;
    if (!url) continue;
    const repo = githubOwnerRepo(url);
    if (repo) return repo;
  }
  return null;
}

function githubOwnerRepo(url) {
  const trimmed = url.trim().replace(/\.git$/, '');
  let rest = null;
  if (trimmed.startsWith('git@github.com:')) rest = trimmed.slice('git@github.com:'.length);
  else {
    const idx = trimmed.indexOf('github.com/');
    if (idx >= 0) rest = trimmed.slice(idx + 'github.com/'.length);
  }
  if (!rest) return null;
  const [owner, name, extra] = rest.split('/');
  if (!owner || !name || extra) return null;
  return `${owner}/${name}`;
}

function canonicalize(value) {
  try {
    return fs.realpathSync(value);
  } catch {
    return path.resolve(value);
  }
}

function canonicalKey(value) {
  return canonicalize(value).replace(/\/+$/, '').toLowerCase();
}

