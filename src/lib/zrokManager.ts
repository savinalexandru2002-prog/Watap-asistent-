import { spawn, execFile, ChildProcess } from 'child_process';
import https from 'https';
import path from 'path';
import fs from 'fs';
import { getSetting, setSetting } from '../db/settings.ts';

const ROOT_DIR = process.cwd();
const BIN_DIR = path.resolve(ROOT_DIR, 'bin');
const ZROK_BIN_PATH = path.resolve(BIN_DIR, 'zrok2');
const ZROK_HOME_DIR = path.resolve(ROOT_DIR, '.zrok_data');
const ZROK_ENV_DESC = 'WhatsOmni-AI-Cloud';
const ZROK_DOWNLOAD_URL =
  'https://github.com/openziti/zrok/releases/download/v2.0.10/zrok_2.0.10_linux_amd64.tar.gz';
const CLOUDFLARED_BIN_PATH = path.resolve(BIN_DIR, 'cloudflared');
const CLOUDFLARED_DOWNLOAD_URL =
  'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64';

export interface ZrokSettings {
  token: string;
  customName: string;
  autoStart: boolean;
  basicAuth: string;
  lastPublicUrl: string;
}

export interface ZrokStatusSnapshot {
  binaryInstalled: boolean;
  version: string | null;
  isEnabled: boolean;
  isRunning: boolean;
  publicUrl: string | null;
  tunnelProvider: 'zrok' | 'cloudflare' | null;
  fallbackNotice: string | null;
  customName: string;
  autoStart: boolean;
  hasToken: boolean;
  maskedToken: string | null;
  hasBasicAuth: boolean;
  error: string | null;
  logs: string[];
}

interface LocalZrokEnv {
  zrokToken: string;
  envZId: string;
  apiEndpoint?: string;
  filePath: string;
}

interface OverviewShare {
  shareToken: string;
  shareMode?: string;
  backendProxyEndpoint?: string;
  frontendEndpoints: string[];
}

interface OverviewEnvironment {
  envZId: string;
  description: string;
  shares: OverviewShare[];
}

interface OverviewData {
  environments: OverviewEnvironment[];
  reservedPublicNames: string[];
}

let zrokProcess: ChildProcess | null = null;
let cloudflaredProcess: ChildProcess | null = null;
let zrokRunning = false;
let zrokPublicUrl: string | null = null;
let activeTunnelProvider: 'zrok' | 'cloudflare' | null = null;
let zrokFallbackNotice: string | null = null;
let zrokLastError: string | null = null;
let zrokLogs: string[] = [];
let zrokVersionCache: string | null = null;
let zrokSettingsCache: ZrokSettings = {
  token: process.env.ZROK_TOKEN || '',
  customName: process.env.ZROK_CUSTOM_NAME || '',
  autoStart: process.env.ZROK_AUTO_START === 'true',
  basicAuth: '',
  lastPublicUrl: '',
};
let settingsLoaded = false;
let hooksRegistered = false;
let syncInFlight: Promise<void> | null = null;
let startInFlight: Promise<ZrokStatusSnapshot> | null = null;
let zrokBackoffAttempts = 0;
let zrokRetryAfterMs = 0;

function getZrokBasicAuthHeader(basicAuth?: string): Record<string, string> {
  const val = (basicAuth || '').trim();
  const colonIdx = val.indexOf(':');
  if (colonIdx > 0 && colonIdx < val.length - 1) {
    return { Authorization: `Basic ${Buffer.from(val, 'utf8').toString('base64')}` };
  }
  return {};
}

export function canWatchdogAutoStartZrok(): boolean {
  if (zrokRunning || zrokProcess || cloudflaredProcess || startInFlight) return false;
  return Date.now() >= zrokRetryAfterMs;
}

async function fetchPublicTunnelHealth(
  normalizedUrl: string,
  extraHeaders: Record<string, string> = {}
): Promise<{ ok: boolean; status: number; body: any }> {
  try {
    const res = await fetch(`${normalizedUrl}/api/health`, {
      headers: extraHeaders,
      signal: AbortSignal.timeout(6000),
    });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok && body?.ok === true, status: res.status, body };
  } catch (directErr) {
    // Container metadata DNS (169.254.169.254) can cache negative NXDOMAIN on brand-new *.trycloudflare.com hosts;
    // fall back to Cloudflare DoH A-record lookup while keeping full TLS SNI verification.
    const parsed = new URL(normalizedUrl);
    const hostname = parsed.hostname;
    const dohRes = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=A`,
      { headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(5000) }
    );
    if (!dohRes.ok) throw directErr;
    const dohJson: any = await dohRes.json();
    const aRecord = Array.isArray(dohJson?.Answer)
      ? dohJson.Answer.find((a: any) => a?.type === 1 && typeof a?.data === 'string')?.data
      : null;
    if (!aRecord) throw directErr;

    return await new Promise((resolve, reject) => {
      const req = https.request(
        {
          host: aRecord,
          port: 443,
          servername: hostname,
          path: '/api/health',
          method: 'GET',
          headers: {
            Host: hostname,
            ...extraHeaders,
          },
          timeout: 7000,
        },
        (res) => {
          let raw = '';
          res.on('data', (chunk) => {
            raw += chunk.toString();
          });
          res.on('end', () => {
            let body: any = {};
            try {
              body = JSON.parse(raw);
            } catch {}
            const status = res.statusCode || 0;
            resolve({ ok: status >= 200 && status < 300 && body?.ok === true, status, body });
          });
        }
      );
      req.on('timeout', () => {
        req.destroy(new Error('TLS health check timeout'));
      });
      req.on('error', reject);
      req.end();
    });
  }
}

export async function pingZrokPublicHealth(): Promise<boolean> {
  if (!zrokRunning || !zrokPublicUrl) return false;
  const settings = await loadZrokSettings();
  const normalizedUrl = normalizeZrokUrl(zrokPublicUrl);
  try {
    const res = await fetchPublicTunnelHealth(
      normalizedUrl,
      activeTunnelProvider === 'zrok' ? getZrokBasicAuthHeader(settings.basicAuth) : {}
    );
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureCloudflaredBinary(): Promise<void> {
  if (fs.existsSync(CLOUDFLARED_BIN_PATH)) return;
  if (!fs.existsSync(BIN_DIR)) {
    fs.mkdirSync(BIN_DIR, { recursive: true });
  }
  pushZrokLog('Se instalează motorul de rezervă Cloudflare Tunnel (cloudflared)...');
  const res = await fetch(CLOUDFLARED_DOWNLOAD_URL, { redirect: 'follow', signal: AbortSignal.timeout(45000) });
  if (!res.ok) {
    throw new Error(`Descărcarea cloudflared a eșuat: HTTP ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(CLOUDFLARED_BIN_PATH, buf);
  fs.chmodSync(CLOUDFLARED_BIN_PATH, 0o755);
  pushZrokLog('Motorul de rezervă Cloudflare Tunnel a fost instalat.');
}

async function startCloudflareFallbackTunnel(port: number, reason: string): Promise<ZrokStatusSnapshot> {
  await stopTunnelProcessOnly();
  await ensureCloudflaredBinary();
  registerZrokShutdownHooks();

  pushZrokLog('Se pornește tunelul HTTPS de rezervă (Cloudflare Quick Tunnel, fără limită 429)...');

  return new Promise((resolve, reject) => {
    let settled = false;
    const proc = spawn(
      CLOUDFLARED_BIN_PATH,
      ['tunnel', '--url', `http://127.0.0.1:${port}`, '--protocol', 'http2', '--no-autoupdate'],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );

    cloudflaredProcess = proc;
    zrokRunning = true;
    activeTunnelProvider = 'cloudflare';
    zrokPublicUrl = null;
    zrokLastError = null;
    zrokFallbackNotice = reason;

    const clearTimer = () => clearTimeout(startupTimer);

    const handleChunk = (data: Buffer) => {
      const text = data.toString();
      const lines = text.split(/\r?\n/);
      for (const line of lines) {
        const clean = line.trim();
        if (!clean) continue;
        const match = clean.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/i);
        if (match?.[0] && !settled) {
          const cfUrl = match[0].replace(/\/+$/, '');
          settled = true;
          clearTimer();
          zrokPublicUrl = cfUrl;
          zrokRunning = true;
          activeTunnelProvider = 'cloudflare';
          zrokLastError = null;
          pushZrokLog(`[FAILOVER_LIVE] Tunelul de rezervă Cloudflare este LIVE 24/7 la: ${cfUrl}`);
          saveZrokSettings({ lastPublicUrl: cfUrl })
            .catch(() => {})
            .finally(async () => {
              // Give Cloudflare edge DNS ~2s to propagate before returning LIVE
              await new Promise((r) => setTimeout(r, 2000));
              resolve(await buildStatusSnapshot());
            });
          return;
        }
        if (/ERR|failed|registered tunnel connection/i.test(clean)) {
          pushZrokLog(`[CF] ${clean.slice(0, 180)}`);
        }
      }
    };

    proc.stdout?.on('data', handleChunk);
    proc.stderr?.on('data', handleChunk);

    proc.on('error', (err) => {
      if (cloudflaredProcess === proc) {
        cloudflaredProcess = null;
        zrokRunning = false;
        zrokPublicUrl = null;
        activeTunnelProvider = null;
      }
      if (!settled) {
        settled = true;
        clearTimer();
        reject(err);
      }
    });

    proc.on('exit', (code, signal) => {
      if (cloudflaredProcess === proc) {
        cloudflaredProcess = null;
        zrokRunning = false;
        zrokPublicUrl = null;
        activeTunnelProvider = null;
      }
      pushZrokLog(`Tunelul Cloudflare oprit (cod=${code ?? 'null'}, signal=${signal ?? 'none'}).`);
      if (!settled) {
        settled = true;
        clearTimer();
        reject(new Error(`Cloudflare Tunnel s-a oprit neașteptat (cod ${code ?? 'unknown'}).`));
      }
    });

    const startupTimer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try {
          proc.kill('SIGTERM');
        } catch {}
        reject(new Error('Timeout la pornirea tunelului de rezervă Cloudflare (20s).'));
      }
    }, 20000);
  });
}

function pushZrokLog(line: string) {
  const clean = line.replace(/\x1b\[[0-9;]*m/g, '').trim();
  if (!clean) return;
  const ts = new Date().toLocaleTimeString('ro-RO', { hour12: false });
  zrokLogs.push(`[${ts}] ${clean}`);
  if (zrokLogs.length > 80) {
    zrokLogs = zrokLogs.slice(-80);
  }
}

function getZrokEnv(): NodeJS.ProcessEnv {
  if (!fs.existsSync(ZROK_HOME_DIR)) {
    fs.mkdirSync(ZROK_HOME_DIR, { recursive: true });
  }
  return {
    ...process.env,
    HOME: ZROK_HOME_DIR,
  };
}

function readLocalZrokEnv(): LocalZrokEnv | null {
  const candidates = [
    path.join(ZROK_HOME_DIR, '.zrok2', 'environment.json'),
    path.join(ZROK_HOME_DIR, '.zrok', 'environment.json'),
  ];
  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      const zrokToken = String(parsed?.zrok_token || parsed?.zrokToken || '').trim();
      const envZId = String(parsed?.ziti_identity || parsed?.env_zid || parsed?.envZId || '').trim();
      if (zrokToken || envZId) {
        return {
          zrokToken,
          envZId,
          apiEndpoint: parsed?.api_endpoint ? String(parsed.api_endpoint) : undefined,
          filePath,
        };
      }
    } catch {}
  }
  return null;
}

function wipeLocalZrokEnv() {
  const dirs = [
    path.join(ZROK_HOME_DIR, '.zrok2'),
    path.join(ZROK_HOME_DIR, '.zrok'),
  ];
  for (const dir of dirs) {
    if (fs.existsSync(dir)) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {}
    }
  }
}

async function killOrphanedZrokShareProcesses(): Promise<void> {
  if (zrokProcess && !zrokProcess.killed) return;
  await new Promise<void>((resolve) => {
    execFile('pkill', ['-INT', '-f', `${ZROK_BIN_PATH} share`], { timeout: 2500 }, () => {
      resolve();
    });
  });
  await new Promise((r) => setTimeout(r, 300));
}

async function loadZrokSettings(): Promise<ZrokSettings> {
  if (settingsLoaded) return zrokSettingsCache;
  try {
    const raw = await getSetting('zrok_settings');
    if (raw) {
      const parsed = JSON.parse(raw);
      zrokSettingsCache = {
        token: parsed.token || process.env.ZROK_TOKEN || '',
        customName: parsed.customName || process.env.ZROK_CUSTOM_NAME || '',
        autoStart: typeof parsed.autoStart === 'boolean' ? parsed.autoStart : process.env.ZROK_AUTO_START === 'true',
        basicAuth: parsed.basicAuth || '',
        lastPublicUrl: parsed.lastPublicUrl || '',
      };
    }
  } catch {}
  settingsLoaded = true;
  return zrokSettingsCache;
}

async function saveZrokSettings(partial: Partial<ZrokSettings>): Promise<void> {
  const current = await loadZrokSettings();
  zrokSettingsCache = { ...current, ...partial };
  try {
    await setSetting('zrok_settings', JSON.stringify(zrokSettingsCache));
  } catch (err) {
    console.warn('[ZROK] Could not persist zrok_settings to DB:', err);
  }
}

function execZrok(args: string[], timeoutMs: number = 15000): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(ZROK_BIN_PATH, args, { env: getZrokEnv(), timeout: timeoutMs }, (err, stdout, stderr) => {
      if (err) {
        const msg = (stderr || stdout || err.message || 'zrok command failed').toString().trim();
        return reject(new Error(msg));
      }
      resolve({ stdout: stdout.toString(), stderr: stderr.toString() });
    });
  });
}

function execCmd(cmd: string, args: string[], timeoutMs: number = 30000): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: timeoutMs }, (err, stdout, stderr) => {
      if (err) {
        return reject(new Error((stderr || stdout || err.message).toString()));
      }
      resolve({ stdout: stdout.toString(), stderr: stderr.toString() });
    });
  });
}

export async function ensureZrokBinary(): Promise<void> {
  if (fs.existsSync(ZROK_BIN_PATH)) return;

  if (!fs.existsSync(BIN_DIR)) {
    fs.mkdirSync(BIN_DIR, { recursive: true });
  }
  pushZrokLog('Se descarcă binarul oficial zrok2 v2.0.9 pentru Linux...');
  const res = await fetch(ZROK_DOWNLOAD_URL, { signal: AbortSignal.timeout(45000) });
  if (!res.ok) {
    throw new Error(`Descărcarea zrok2 a eșuat: HTTP ${res.status}`);
  }
  const tarPath = '/tmp/zrok2_download.tar.gz';
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(tarPath, buf);
  await execCmd('tar', ['-xzf', tarPath, '-C', BIN_DIR, 'zrok2']);
  fs.unlinkSync(tarPath);
  fs.chmodSync(ZROK_BIN_PATH, 0o755);
  pushZrokLog('Binarul zrok2 a fost instalat cu succes.');
}

async function getZrokVersion(): Promise<string | null> {
  if (!fs.existsSync(ZROK_BIN_PATH)) return null;
  if (zrokVersionCache) return zrokVersionCache;
  try {
    const { stdout } = await execZrok(['version'], 5000);
    const match = stdout.match(/v\d+\.\d+\.\d+/);
    zrokVersionCache = match ? match[0] : 'v2.0.9';
    return zrokVersionCache;
  } catch {
    return null;
  }
}

async function getOverviewJson(): Promise<OverviewData | null> {
  try {
    const { stdout } = await execZrok(['overview', '--json'], 10000);
    const raw = JSON.parse(stdout);
    const environments: OverviewEnvironment[] = [];
    const envList = Array.isArray(raw?.environments) ? raw.environments : [];

    for (const item of envList) {
      const envMeta = item?.environment || item || {};
      const envZId = String(envMeta?.zId || envMeta?.envZId || '').trim();
      if (!envZId) continue;
      const description = String(envMeta?.description || '').trim();
      const rawShares = Array.isArray(item?.shares) ? item.shares : [];
      const shares: OverviewShare[] = rawShares
        .map((s: any) => ({
          shareToken: String(s?.shareToken || s?.token || '').trim(),
          shareMode: s?.shareMode ? String(s.shareMode) : undefined,
          backendProxyEndpoint: s?.backendProxyEndpoint
            ? String(s.backendProxyEndpoint)
            : s?.target
            ? String(s.target)
            : undefined,
          frontendEndpoints: Array.isArray(s?.frontendEndpoints)
            ? s.frontendEndpoints.map((u: any) => String(u))
            : [],
        }))
        .filter((s: OverviewShare) => Boolean(s.shareToken));

      environments.push({ envZId, description, shares });
    }

    const reservedPublicNames: string[] = [];
    const nsList = Array.isArray(raw?.namespaces) ? raw.namespaces : [];
    for (const ns of nsList) {
      const nsToken = String(ns?.namespaceToken || ns?.token || ns?.name || '').toLowerCase();
      const names = Array.isArray(ns?.names) ? ns.names : [];
      for (const n of names) {
        const nameVal = String(typeof n === 'string' ? n : n?.name || '').trim().toLowerCase();
        if (nameVal && (!nsToken || nsToken === 'public')) {
          reservedPublicNames.push(nameVal);
        }
      }
    }

    // Check top-level names array from zrok2 overview --json
    if (Array.isArray(raw?.names)) {
      for (const n of raw.names) {
        const nameVal = String(n?.name || '').trim().toLowerCase();
        const nsToken = String(n?.namespaceToken || '').toLowerCase();
        const nsName = String(n?.namespaceName || '').toLowerCase();
        if (nameVal && (nsToken === 'public' || nsName === 'shares.zrok.io' || (!nsToken && !nsName))) {
          reservedPublicNames.push(nameVal);
        }
      }
    }

    return { environments, reservedPublicNames };
  } catch {
    return null;
  }
}

function normalizeZrokUrl(rawUrl: string): string {
  const clean = rawUrl.trim().replace(/\/+$/, '');
  if (!clean) return clean;
  return /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;
}

async function findActiveShareForEnv(currentEnvZId?: string): Promise<{ shareToken?: string; publicUrl?: string }> {
  const overview = await getOverviewJson();
  if (overview) {
    const targetEnvs = currentEnvZId
      ? overview.environments.filter((e) => e.envZId === currentEnvZId)
      : overview.environments;
    for (const env of targetEnvs) {
      for (const sh of env.shares) {
        const url = sh.frontendEndpoints.find((u) => /\.zrok\.io/i.test(u));
        if (url) {
          return { shareToken: sh.shareToken, publicUrl: normalizeZrokUrl(url) };
        }
      }
    }
  }
  try {
    const { stdout } = await execZrok(['overview'], 8000);
    const urlMatch = stdout.match(/([a-zA-Z0-9-]+\.shares?\.zrok\.io)/i);
    const shareMatch = stdout.match(/│\s*([a-z0-9]{10,16})\s*│\s*public\s*│/i);
    return {
      shareToken: shareMatch?.[1],
      publicUrl: urlMatch?.[1] ? normalizeZrokUrl(urlMatch[1]) : undefined,
    };
  } catch {
    return {};
  }
}

async function cleanupStaleZrokResources(
  currentEnvZId?: string,
  targetCustomName?: string,
  deleteSharesInCurrentEnv: boolean = false
): Promise<void> {
  const overview = await getOverviewJson();
  if (!overview) return;

  const normalizedCustom = (targetCustomName || '').trim().toLowerCase();

  for (const env of overview.environments) {
    const isStaleWhatsOmniEnv =
      env.description === ZROK_ENV_DESC && Boolean(currentEnvZId) && env.envZId !== currentEnvZId;

    for (const sh of env.shares) {
      const holdsTargetName =
        Boolean(normalizedCustom) &&
        sh.frontendEndpoints.some((u) => {
          const clean = u.toLowerCase();
          return (
            clean.includes(`//${normalizedCustom}.`) ||
            clean.startsWith(`${normalizedCustom}.`) ||
            clean.includes(normalizedCustom)
          );
        });

      const isCurrentEnvShare = Boolean(currentEnvZId) && env.envZId === currentEnvZId && deleteSharesInCurrentEnv;

      if (isStaleWhatsOmniEnv || isCurrentEnvShare || holdsTargetName) {
        try {
          await execZrok(['delete', 'share', sh.shareToken, '--envzid', env.envZId], 8000);
          pushZrokLog(
            holdsTargetName
              ? `Eliberat numele "${normalizedCustom}" de pe conexiunea veche (${sh.shareToken}) pentru conectare directă.`
              : `Curățat share Zrok rezidual (${sh.shareToken}) din mediul ${env.envZId}.`
          );
        } catch {}
      }
    }

    if (isStaleWhatsOmniEnv) {
      try {
        await execZrok(['delete', 'environment', env.envZId, '--force'], 10000);
        pushZrokLog(`Curățat mediu Zrok duplicat (${env.envZId}).`);
      } catch {}
    }
  }
}

async function stopTunnelProcessOnly(): Promise<void> {
  if (zrokProcess) {
    pushZrokLog('Se oprește tunelul Zrok...');
    const proc = zrokProcess;
    zrokProcess = null;
    try {
      proc.kill('SIGINT');
      await new Promise((r) => setTimeout(r, 900));
      try {
        if (!proc.killed) proc.kill('SIGTERM');
      } catch {}
    } catch {}
  }
  if (cloudflaredProcess) {
    pushZrokLog('Se oprește tunelul de rezervă Cloudflare...');
    const cfProc = cloudflaredProcess;
    cloudflaredProcess = null;
    try {
      cfProc.kill('SIGINT');
      await new Promise((r) => setTimeout(r, 600));
      try {
        if (!cfProc.killed) cfProc.kill('SIGTERM');
      } catch {}
    } catch {}
  }
  zrokRunning = false;
  zrokPublicUrl = null;
  activeTunnelProvider = null;
  zrokFallbackNotice = null;
}

async function buildStatusSnapshot(): Promise<ZrokStatusSnapshot> {
  const settings = await loadZrokSettings();
  const activeToken = (settings.token || process.env.ZROK_TOKEN || '').trim();
  const binaryInstalled = fs.existsSync(ZROK_BIN_PATH);
  const [version, isEnabled] = await Promise.all([getZrokVersion(), checkZrokEnabled()]);
  const hasLiveProc = Boolean(zrokProcess || cloudflaredProcess);

  return {
    binaryInstalled,
    version,
    isEnabled,
    isRunning: zrokRunning && hasLiveProc,
    publicUrl: zrokPublicUrl,
    tunnelProvider: zrokRunning && hasLiveProc ? activeTunnelProvider : null,
    fallbackNotice: zrokFallbackNotice,
    customName: settings.customName,
    autoStart: settings.autoStart,
    hasToken: Boolean(activeToken),
    maskedToken: maskToken(activeToken),
    hasBasicAuth: Boolean(settings.basicAuth),
    error: zrokLastError,
    logs: [...zrokLogs],
  };
}

async function syncLocalEnvWithSettings(): Promise<void> {
  if (syncInFlight) return syncInFlight;
  syncInFlight = (async () => {
    if (!fs.existsSync(ZROK_BIN_PATH)) return;
    const settings = await loadZrokSettings();
    const configuredToken = (settings.token || process.env.ZROK_TOKEN || '').trim();
    if (!configuredToken) return;

    const localEnv = readLocalZrokEnv();
    if (!localEnv || localEnv.zrokToken !== configuredToken) {
      pushZrokLog('Token Zrok actualizat detectat; se sincronizează mediul local cu noul token...');
      await enableZrok(configuredToken);
    }
  })().finally(() => {
    syncInFlight = null;
  });
  return syncInFlight;
}

export async function checkZrokEnabled(): Promise<boolean> {
  if (!fs.existsSync(ZROK_BIN_PATH)) return false;
  const settings = await loadZrokSettings();
  const configuredToken = (settings.token || process.env.ZROK_TOKEN || '').trim();
  const localEnv = readLocalZrokEnv();

  if (localEnv) {
    if (configuredToken && localEnv.zrokToken && localEnv.zrokToken !== configuredToken) {
      return false;
    }
    return true;
  }

  try {
    const { stdout } = await execZrok(['status'], 5000);
    return !stdout.includes('To create a local environment') && /Environment|Ziti/i.test(stdout);
  } catch {
    return false;
  }
}

function maskToken(tok: string): string | null {
  const t = tok.trim();
  if (!t) return null;
  if (t.length <= 6) return '***';
  return `${t.slice(0, 3)}••••${t.slice(-3)}`;
}

export async function getZrokStatus(): Promise<ZrokStatusSnapshot> {
  const settings = await loadZrokSettings();
  const activeToken = (settings.token || process.env.ZROK_TOKEN || '').trim();
  const localEnv = readLocalZrokEnv();

  // Auto-sync silently if DB holds a newer token than .zrok2/environment.json and tunnel isn't active
  if (activeToken && (!localEnv || localEnv.zrokToken !== activeToken) && !zrokRunning) {
    try {
      await syncLocalEnvWithSettings();
    } catch {}
  }

  return buildStatusSnapshot();
}

export async function enableZrok(token: string, description: string = ZROK_ENV_DESC): Promise<ZrokStatusSnapshot> {
  const cleanToken = String(token || '').trim();
  if (!cleanToken) {
    throw new Error('Introdu un token valid Zrok (obținut din contul tău zrok.io).');
  }

  await ensureZrokBinary();
  zrokLastError = null;

  const localEnv = readLocalZrokEnv();
  if (localEnv && localEnv.zrokToken === cleanToken) {
    // Verify existing environment is still authorized on the Zrok controller
    try {
      await execZrok(['overview', '--json'], 8000);
      await saveZrokSettings({ token: cleanToken });
      await cleanupStaleZrokResources(localEnv.envZId);
      pushZrokLog('Mediul Zrok existent este valid și conectat direct (fără duplicate).');
      return buildStatusSnapshot();
    } catch (verifyErr: any) {
      pushZrokLog(`Mediul Zrok local necesită re-activare (${verifyErr?.message || 'sesiune expirată'})...`);
    }
  } else if (localEnv) {
    pushZrokLog('Token Zrok schimbat: se curăță mediul anterior și se configurează noul token...');
  }

  await stopTunnelProcessOnly();
  await killOrphanedZrokShareProcesses();

  // Attempt graceful disable first (ignore 401 if old token was revoked)
  try {
    await execZrok(['disable'], 8000);
  } catch {}
  wipeLocalZrokEnv();

  // Persist token immediately so DB stays in sync with user intent
  await saveZrokSettings({ token: cleanToken });

  pushZrokLog('Se activează mediul Zrok cu noul token...');
  try {
    const { stdout, stderr } = await execZrok(['enable', cleanToken, '--headless', '-d', description], 20000);
    if (stdout) pushZrokLog(stdout);
    if (stderr) pushZrokLog(stderr);
    const freshEnv = readLocalZrokEnv();
    await cleanupStaleZrokResources(freshEnv?.envZId);
    pushZrokLog('Zrok activat cu succes! Conexiunile vechi au fost curățate.');
  } catch (err: any) {
    const msg = err?.message || 'Activarea Zrok a eșuat.';
    zrokLastError = msg;
    pushZrokLog(`EROARE activare: ${msg}`);
    throw new Error(msg);
  }

  return buildStatusSnapshot();
}

export async function stopZrokTunnel(): Promise<ZrokStatusSnapshot> {
  await stopTunnelProcessOnly();
  return buildStatusSnapshot();
}

export async function disableZrok(): Promise<ZrokStatusSnapshot> {
  await stopTunnelProcessOnly();
  await killOrphanedZrokShareProcesses();
  try {
    if (fs.existsSync(ZROK_BIN_PATH)) {
      await execZrok(['disable'], 8000);
    }
  } catch {}
  wipeLocalZrokEnv();
  await saveZrokSettings({ token: '', autoStart: false, lastPublicUrl: '' });
  zrokLastError = null;
  pushZrokLog('Mediul Zrok a fost dezactivat și tokenul șters.');
  return buildStatusSnapshot();
}

export async function updateZrokPreferences(partial: {
  customName?: string;
  autoStart?: boolean;
  basicAuth?: string;
}): Promise<ZrokStatusSnapshot> {
  const cleanName =
    typeof partial.customName === 'string'
      ? partial.customName.trim().toLowerCase().replace(/[^a-z0-9-]/g, '')
      : undefined;
  await saveZrokSettings({
    ...(cleanName !== undefined ? { customName: cleanName } : {}),
    ...(typeof partial.autoStart === 'boolean' ? { autoStart: partial.autoStart } : {}),
    ...(typeof partial.basicAuth === 'string' ? { basicAuth: partial.basicAuth.trim() } : {}),
  });
  return buildStatusSnapshot();
}

export async function startZrokTunnel(
  port: number = 3000,
  opts?: { customName?: string; basicAuth?: string; autoStart?: boolean; token?: string; fromWatchdog?: boolean }
): Promise<ZrokStatusSnapshot> {
  if (startInFlight) {
    if (opts?.fromWatchdog) {
      return startInFlight;
    }
    // Wait for ongoing start attempt before running an explicit user start
    try {
      await startInFlight;
    } catch {}
    if (!opts && zrokRunning && zrokPublicUrl) {
      return buildStatusSnapshot();
    }
  }

  if (!opts?.fromWatchdog) {
    zrokBackoffAttempts = 0;
    zrokRetryAfterMs = 0;
  }

  const runPromise = startZrokTunnelInternal(port, opts).finally(() => {
    if (startInFlight === runPromise) {
      startInFlight = null;
    }
  });
  startInFlight = runPromise;
  return runPromise;
}

async function startZrokTunnelInternal(
  port: number = 3000,
  opts?: { customName?: string; basicAuth?: string; autoStart?: boolean; token?: string; fromWatchdog?: boolean }
): Promise<ZrokStatusSnapshot> {
  registerZrokShutdownHooks();
  await ensureZrokBinary();
  const settings = await loadZrokSettings();

  if (opts?.token && opts.token.trim()) {
    await enableZrok(opts.token.trim());
  } else {
    const savedToken = (settings.token || process.env.ZROK_TOKEN || '').trim();
    const localEnv = readLocalZrokEnv();

    if (!localEnv) {
      if (!savedToken) {
        throw new Error('Zrok nu este activat încă. Introdu mai întâi tokenul tău Zrok.');
      }
      await enableZrok(savedToken);
    } else if (savedToken && localEnv.zrokToken !== savedToken) {
      await enableZrok(savedToken);
    } else {
      // Validate current env doesn't return 401 Unauthorized
      try {
        await execZrok(['overview', '--json'], 8000);
      } catch (authErr: any) {
        if (savedToken) {
          pushZrokLog(`Token local invalid (${authErr?.message || '401'}); se re-activează cu tokenul salvat...`);
          await enableZrok(savedToken);
        } else {
          throw new Error('Tokenul Zrok local este expirat sau invalid (401). Introdu noul token Zrok.');
        }
      }
    }
  }

  const latestSettings = await loadZrokSettings();
  const rawCustomName = opts?.customName !== undefined ? opts.customName : latestSettings.customName;
  const cleanCustomName = String(rawCustomName || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '');
  const cleanBasicAuth =
    opts?.basicAuth !== undefined ? String(opts.basicAuth).trim() : latestSettings.basicAuth;
  const nextAutoStart =
    typeof opts?.autoStart === 'boolean' ? opts.autoStart : latestSettings.autoStart;

  await saveZrokSettings({
    customName: cleanCustomName,
    basicAuth: cleanBasicAuth,
    autoStart: nextAutoStart,
  });

  if (zrokProcess && zrokRunning) {
    await stopTunnelProcessOnly();
  }
  await killOrphanedZrokShareProcesses();

  // Clean up any stale WhatsOmni environments or lingering shares before launching so we connect DIRECTLY
  const currentLocalEnv = readLocalZrokEnv();
  await cleanupStaleZrokResources(currentLocalEnv?.envZId, cleanCustomName, true);

  zrokLastError = null;
  const targetUrl = `http://127.0.0.1:${port}`;
  const args = ['share', 'public', targetUrl, '--headless'];

  if (cleanCustomName) {
    if (cleanCustomName.length < 3 || cleanCustomName.length > 32) {
      const msg = `Subdomeniul personalizat "${cleanCustomName}" este prea scurt (Zrok cere minim 3 caractere, ex: alexandru sau alexia-bot). Modifică subdomeniul sau lasă-l gol.`;
      zrokLastError = msg;
      pushZrokLog(`EROARE subdomeniu: ${msg}`);
      throw new Error(msg);
    }
    const overview = await getOverviewJson();
    const alreadyReserved = overview?.reservedPublicNames?.includes(cleanCustomName);
    if (alreadyReserved) {
      pushZrokLog(`Numele "${cleanCustomName}" există în cont; se conectează direct la https://${cleanCustomName}.shares.zrok.io...`);
    } else {
      try {
        pushZrokLog(`Se rezervă numele "${cleanCustomName}" în namespace-ul public...`);
        await execZrok(['create', 'name', cleanCustomName, '-n', 'public'], 10000);
      } catch (nameErr: any) {
        const msg = nameErr?.message || '';
        if (/not a valid share name|DNS check|profanity/i.test(msg)) {
          const userMsg = `Subdomeniul "${cleanCustomName}" a fost respins de Zrok (${msg}). Alege alt nume cu minim 3 caractere (ex: alexandru sau alexia-bot).`;
          zrokLastError = userMsg;
          pushZrokLog(`EROARE subdomeniu: ${userMsg}`);
          throw new Error(userMsg);
        }
        if (!/exist|conflict|taken|409/i.test(msg)) {
          pushZrokLog(`Notă nume personalizat: ${msg}`);
        }
      }
    }
    args.push('-n', `public:${cleanCustomName}`);
  }

  const colonIdx = cleanBasicAuth.indexOf(':');
  if (colonIdx > 0 && colonIdx < cleanBasicAuth.length - 1) {
    args.push('--basic-auth', cleanBasicAuth);
  }

  let spawnAttempts = 0;
  const spawnOnce = (allowRetry: boolean): Promise<ZrokStatusSnapshot> => {
    spawnAttempts++;
    if (spawnAttempts > 3) {
      return Promise.reject(
        new Error('Serviciul Zrok a refuzat conexiunea temporar (limită 429 / busy). Watchdog-ul va reîncerca automat.')
      );
    }
    pushZrokLog(`Se pornește tunelul Zrok spre ${targetUrl} (încercarea ${spawnAttempts}/3)...`);

    return new Promise((resolve, reject) => {
      let settled = false;
      let staleShareToken: string | null = null;
      let busyDetected = false;
      let attemptLogs: string[] = [];
      let overviewCheckTimer: ReturnType<typeof setTimeout> | null = null;

      const clearTimers = () => {
        clearTimeout(startupTimer);
        if (overviewCheckTimer) clearTimeout(overviewCheckTimer);
      };

      const finishSuccess = async () => {
        if (settled) return;
        settled = true;
        clearTimers();
        zrokBackoffAttempts = 0;
        zrokRetryAfterMs = 0;
        zrokLastError = null;
        zrokFallbackNotice = null;
        activeTunnelProvider = 'zrok';
        if (zrokPublicUrl) {
          await saveZrokSettings({ lastPublicUrl: zrokPublicUrl });
        }
        resolve(await buildStatusSnapshot());
      };

      const finishError = async (errMsg: string) => {
        if (settled) return;
        settled = true;
        clearTimers();
        zrokLastError = errMsg;
        reject(new Error(errMsg));
      };

      const proc = spawn(ZROK_BIN_PATH, args, {
        env: getZrokEnv(),
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      zrokProcess = proc;
      zrokRunning = true;
      zrokPublicUrl = null;
      activeTunnelProvider = 'zrok';

      const handleChunk = (data: Buffer) => {
        const text = data.toString();
        const lines = text.split(/\r?\n/);
        for (const line of lines) {
          const cleanLine = line.replace(/\x1b\[[0-9;]*m/g, '').trim();
          if (!cleanLine) continue;
          attemptLogs.push(cleanLine);
          pushZrokLog(cleanLine);

          if (/busy|429|503|retry shortly|limit/i.test(cleanLine)) {
            busyDetected = true;
          }

          const inUseMatch = cleanLine.match(/in use by share '([a-z0-9]+)'/i);
          if (inUseMatch?.[1]) {
            staleShareToken = inUseMatch[1];
          }

          const fullUrlMatch = cleanLine.match(/https:\/\/[a-zA-Z0-9._-]+\.zrok\.io[^\s"'<>]*/i);
          const hostOnlyMatch = !fullUrlMatch
            ? cleanLine.match(/\b([a-z0-9-]+\.shares?\.zrok\.io)\b/i)
            : null;
          const resolvedUrl = fullUrlMatch?.[0]
            ? fullUrlMatch[0].replace(/\/+$/, '')
            : hostOnlyMatch?.[1]
            ? `https://${hostOnlyMatch[1]}`
            : null;

          if (resolvedUrl) {
            zrokPublicUrl = resolvedUrl;
            finishSuccess();
          }
        }
      };

      proc.stdout?.on('data', handleChunk);
      proc.stderr?.on('data', handleChunk);

      // Query live controller overview after startup in case headless mode hides the URL banner
      overviewCheckTimer = setTimeout(async () => {
        if (settled || !zrokRunning || zrokPublicUrl) return;
        const info = await findActiveShareForEnv(currentLocalEnv?.envZId);
        if (settled || !zrokRunning || zrokPublicUrl) return;
        if (info.publicUrl) {
          zrokPublicUrl = normalizeZrokUrl(info.publicUrl);
          pushZrokLog(`Tunel activ conectat direct: ${zrokPublicUrl}`);
          finishSuccess();
          return;
        }
        if (cleanCustomName) {
          zrokPublicUrl = `https://${cleanCustomName}.shares.zrok.io`;
          pushZrokLog(`Tunel activ conectat direct pe ${zrokPublicUrl}`);
          finishSuccess();
        }
      }, 3500);

      proc.on('error', (err) => {
        zrokRunning = false;
        zrokProcess = null;
        zrokPublicUrl = null;
        activeTunnelProvider = null;
        pushZrokLog(`EROARE proces zrok2: ${err.message}`);
        finishError(err.message);
      });

      proc.on('exit', async (code, signal) => {
        const wasStarting = !settled;
        zrokRunning = false;
        if (zrokProcess === proc) {
          zrokProcess = null;
          zrokPublicUrl = null;
          activeTunnelProvider = null;
        }
        pushZrokLog(`Tunel Zrok oprit (cod=${code ?? 'null'}, signal=${signal ?? 'none'}).`);

        // If Zrok Cloud controller returned HTTP 429 / busy without stale-share collision, activate Cloudflare Tunnel failover automatically
        if (wasStarting && busyDetected && !staleShareToken) {
          settled = true;
          clearTimers();
          zrokBackoffAttempts = Math.min(zrokBackoffAttempts + 1, 4);
          const cooldownSec = zrokBackoffAttempts === 1 ? 120 : zrokBackoffAttempts === 2 ? 300 : 600;
          zrokRetryAfterMs = Date.now() + cooldownSec * 1000;
          const reason = `Controllerul Zrok Cloud (api-v2.zrok.io) are limită activă HTTP 429 pe cont/IP. Site-ul este menținut LIVE 24/7 automat prin tunelul de rezervă Cloudflare.`;
          pushZrokLog(`Zrok Cloud a returnat HTTP 429 (busy). Se comută automat pe tunelul de rezervă Cloudflare pentru funcționare 100% LIVE...`);
          try {
            const cfSnapshot = await startCloudflareFallbackTunnel(port, reason);
            resolve(cfSnapshot);
          } catch (cfErr: any) {
            const fallbackErr = `Zrok Cloud HTTP 429 și failover Cloudflare eșuat: ${cfErr?.message || cfErr}`;
            zrokLastError = fallbackErr;
            reject(new Error(fallbackErr));
          }
          return;
        }

        if (wasStarting && allowRetry && (staleShareToken || (cleanCustomName && code !== 0 && !busyDetected))) {
          settled = true;
          clearTimers();
          try {
            pushZrokLog('Se curăță sesiunea share anterioară și se reîncearcă pornirea în 2.5s...');
            await new Promise((r) => setTimeout(r, 2500));

            const overview = await getOverviewJson();
            if (staleShareToken) {
              try {
                await execZrok(['delete', 'share', staleShareToken], 10000);
              } catch {}
              if (overview) {
                for (const env of overview.environments) {
                  try {
                    await execZrok(['delete', 'share', staleShareToken, '--envzid', env.envZId], 10000);
                  } catch {}
                }
              }
            }

            if (overview && cleanCustomName) {
              for (const env of overview.environments) {
                for (const sh of env.shares) {
                  const holdsName =
                    sh.shareToken === staleShareToken ||
                    sh.frontendEndpoints.some((u) => u.toLowerCase().includes(cleanCustomName));
                  if (holdsName) {
                    try {
                      await execZrok(['delete', 'share', sh.shareToken, '--envzid', env.envZId], 10000);
                    } catch {}
                  }
                }
              }
            }

            const retryResult = await spawnOnce(false);
            resolve(retryResult);
          } catch (retryErr: any) {
            zrokLastError = retryErr?.message || 'Eroare la relansarea tunelului Zrok';
            reject(retryErr);
          }
          return;
        }

        if (wasStarting) {
          finishError(
            attemptLogs[attemptLogs.length - 1] ||
              zrokLogs[zrokLogs.length - 1] ||
              `zrok2 s-a oprit neașteptat (cod ${code ?? 'unknown'}). Verifică tokenul sau numele ales.`
          );
        }
      });

      const startupTimer = setTimeout(async () => {
        if (!settled) {
          if (zrokRunning && !zrokPublicUrl) {
            settled = true;
            resolve(await buildStatusSnapshot());
          } else {
            finishError('Timeout la pornirea tunelului Zrok (18s).');
          }
        }
      }, 18000);
    });
  };

  return spawnOnce(true);
}

export async function autoStartZrokIfConfigured(port: number = 3000): Promise<void> {
  registerZrokShutdownHooks();
  const settings = await loadZrokSettings();
  const token = (settings.token || process.env.ZROK_TOKEN || '').trim();

  // Always keep .zrok2 environment synced with latest DB token even when autoStart is disabled
  if (token) {
    try {
      await syncLocalEnvWithSettings();
    } catch (err: any) {
      console.warn('[ZROK] Startup token sync warning:', err?.message || err);
    }
  }

  const shouldStart = Boolean(token) && (settings.autoStart || process.env.ZROK_AUTO_START === 'true');
  if (!shouldStart) return;

  // Wait 3 seconds for Express server to fully bind to port before launching tunnel
  setTimeout(async () => {
    try {
      if (zrokRunning || startInFlight) return;
      console.log('[ZROK] Auto-starting public Zrok tunnel for entire site...');
      const status = await startZrokTunnel(port, { fromWatchdog: true });
      if (status.publicUrl) {
        console.log(`[ZROK] Entire site is LIVE on Zrok: ${status.publicUrl}`);
      }
    } catch (err: any) {
      console.warn('[ZROK] Auto-start initial attempt paused:', err?.message || err);
    }
  }, 3000);
}

export function registerZrokShutdownHooks() {
  if (hooksRegistered) return;
  hooksRegistered = true;
  const cleanup = () => {
    if (zrokProcess) {
      try {
        zrokProcess.kill('SIGINT');
      } catch {}
      zrokProcess = null;
    }
    if (cloudflaredProcess) {
      try {
        cloudflaredProcess.kill('SIGINT');
      } catch {}
      cloudflaredProcess = null;
    }
  };
  process.on('exit', cleanup);
}

export interface ZrokDiagnosticCheck {
  id: string;
  name: string;
  passed: boolean;
  status: 'PASS' | 'WARN' | 'FAIL';
  details: string;
  durationMs: number;
}

export interface ZrokDiagnosticReport {
  success: boolean;
  overallStatus: 'READY' | 'NEEDS_TOKEN' | 'LIVE' | 'ISSUE';
  checkedAt: string;
  checks: ZrokDiagnosticCheck[];
}

export async function runZrokDiagnostics(port: number = 3000): Promise<ZrokDiagnosticReport> {
  const checks: ZrokDiagnosticCheck[] = [];

  // 1. Binary & version check
  const t1 = Date.now();
  try {
    await ensureZrokBinary();
    const { stdout } = await execZrok(['version'], 5000);
    const verMatch = stdout.match(/v\d+\.\d+\.\d+/);
    const ver = verMatch ? verMatch[0] : 'v2.0.9';
    checks.push({
      id: 'binary',
      name: 'Binar zrok2 executabil',
      passed: true,
      status: 'PASS',
      details: `Instalat și funcțional (${ver}) la ${ZROK_BIN_PATH}`,
      durationMs: Date.now() - t1,
    });
  } catch (err: any) {
    checks.push({
      id: 'binary',
      name: 'Binar zrok2 executabil',
      passed: false,
      status: 'FAIL',
      details: err?.message || 'Binarul zrok2 nu a putut fi executat.',
      durationMs: Date.now() - t1,
    });
  }

  // 2. Controller connectivity check
  const t2 = Date.now();
  try {
    const ctrlRes = await fetch('https://api-v2.zrok.io', {
      method: 'HEAD',
      signal: AbortSignal.timeout(6000),
    });
    checks.push({
      id: 'controller',
      name: 'Conexiune Controller Zrok (api-v2.zrok.io)',
      passed: ctrlRes.ok || ctrlRes.status < 500,
      status: ctrlRes.ok || ctrlRes.status < 500 ? 'PASS' : 'FAIL',
      details: `Răspuns HTTPS ${ctrlRes.status} de la serverul oficial Zrok`,
      durationMs: Date.now() - t2,
    });
  } catch (err: any) {
    checks.push({
      id: 'controller',
      name: 'Conexiune Controller Zrok (api-v2.zrok.io)',
      passed: false,
      status: 'FAIL',
      details: `Eroare rețea spre api-v2.zrok.io: ${err?.message || 'timeout'}`,
      durationMs: Date.now() - t2,
    });
  }

  // 3. Vite + Express Host Header / Reverse Proxy compatibility check
  const t3 = Date.now();
  try {
    const [htmlRes, apiRes] = await Promise.all([
      fetch(`http://127.0.0.1:${port}/`, {
        headers: { Host: 'zrok-test.shares.zrok.io', 'X-Forwarded-Proto': 'https' },
        signal: AbortSignal.timeout(5000),
      }),
      fetch(`http://127.0.0.1:${port}/api/health`, {
        headers: { Host: 'zrok-test.shares.zrok.io', 'X-Forwarded-Proto': 'https' },
        signal: AbortSignal.timeout(5000),
      }),
    ]);
    const htmlBody = await htmlRes.text();
    const apiJson: any = await apiRes.json().catch(() => ({}));
    const ok = htmlRes.ok && htmlBody.includes('id="root"') && apiRes.ok && apiJson?.ok === true;
    checks.push({
      id: 'proxy_host',
      name: 'Compatibilitate Proxy & Host (*.shares.zrok.io)',
      passed: ok,
      status: ok ? 'PASS' : 'FAIL',
      details: ok
        ? 'Frontend Vite și API Express acceptă domeniile *.zrok.io (HTTP 200).'
        : `Frontend=${htmlRes.status}, API=${apiRes.status}`,
      durationMs: Date.now() - t3,
    });
  } catch (err: any) {
    checks.push({
      id: 'proxy_host',
      name: 'Compatibilitate Proxy & Host (*.shares.zrok.io)',
      passed: false,
      status: 'FAIL',
      details: err?.message || 'Eroare la verificarea locală HTTP proxy.',
      durationMs: Date.now() - t3,
    });
  }

  // 4. Local Zrok environment & token validity check
  const t4 = Date.now();
  try {
    await syncLocalEnvWithSettings();
  } catch {}
  const isEnabled = await checkZrokEnabled();
  let envValid = false;
  let envDetails = 'Tokenul Zrok nu a fost activat încă. Introdu tokenul de pe api-v2.zrok.io pentru pornire.';
  if (isEnabled) {
    const overview = await getOverviewJson();
    const localEnv = readLocalZrokEnv();
    if (overview) {
      envValid = true;
      const whatsOmniEnvs = overview.environments.filter((e) => e.description === ZROK_ENV_DESC);
      envDetails = `Token Zrok valid și sincronizat (${localEnv?.envZId || 'activ'}, medii server: ${whatsOmniEnvs.length}).`;
    } else {
      envDetails = 'Tokenul Zrok local este respins (401/expirat). Introdu tokenul actualizat și apasă Activează Token.';
    }
  }
  checks.push({
    id: 'environment',
    name: 'Mediu Zrok & Token Cont',
    passed: envValid,
    status: envValid ? 'PASS' : isEnabled ? 'FAIL' : 'WARN',
    details: envDetails,
    durationMs: Date.now() - t4,
  });

  // 5. End-to-end live public URL reachability check (if tunnel is currently running)
  const t5 = Date.now();
  if (zrokRunning && zrokPublicUrl) {
    const normalizedLiveUrl = normalizeZrokUrl(zrokPublicUrl);
    const diagSettings = await loadZrokSettings();
    let lastLiveErr: any = null;
    let healthResult: { ok: boolean; status: number; body: any } | null = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        healthResult = await fetchPublicTunnelHealth(
          normalizedLiveUrl,
          activeTunnelProvider === 'zrok' ? getZrokBasicAuthHeader(diagSettings.basicAuth) : {}
        );
        if (healthResult.ok || attempt === 2) break;
      } catch (err: any) {
        lastLiveErr = err;
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 2500));
        }
      }
    }

    if (healthResult) {
      checks.push({
        id: 'tunnel_live',
        name: 'Test End-to-End Link Public',
        passed: healthResult.ok,
        status: healthResult.ok ? 'PASS' : 'FAIL',
        details: healthResult.ok
          ? `Site-ul răspunde live prin internet la ${normalizedLiveUrl} (HTTP ${healthResult.status}).`
          : `Tunelul a returnat HTTP ${healthResult.status} la ${normalizedLiveUrl}`,
        durationMs: Date.now() - t5,
      });
    } else {
      checks.push({
        id: 'tunnel_live',
        name: 'Test End-to-End Link Public',
        passed: false,
        status: 'FAIL',
        details: `Nu s-a putut accesa ${normalizedLiveUrl}: ${lastLiveErr?.message || 'eroare'}`,
        durationMs: Date.now() - t5,
      });
    }
  } else {
    checks.push({
      id: 'tunnel_live',
      name: 'Test End-to-End Link Public Zrok',
      passed: false,
      status: 'WARN',
      details: envValid
        ? 'Tunelul este oprit momentan. Apasă "Pornește Site-ul prin Zrok" pentru a testa URL-ul public live.'
        : 'În așteptarea activării tokenului și pornirii tunelului public.',
      durationMs: Date.now() - t5,
    });
  }

  const hasFail = checks.some((c) => c.status === 'FAIL');
  const liveCheck = checks.find((c) => c.id === 'tunnel_live');
  let overallStatus: ZrokDiagnosticReport['overallStatus'] = 'READY';
  if (hasFail) {
    overallStatus = 'ISSUE';
  } else if (liveCheck?.status === 'PASS') {
    overallStatus = 'LIVE';
  } else if (!envValid) {
    overallStatus = 'NEEDS_TOKEN';
  }

  pushZrokLog(
    `Diagnostic Zrok finalizat: ${overallStatus} (${checks.filter((c) => c.status === 'PASS').length}/${checks.length} PASS)`
  );

  return {
    success: !hasFail,
    overallStatus,
    checkedAt: new Date().toISOString(),
    checks,
  };
}
