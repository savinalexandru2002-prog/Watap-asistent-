import { spawn, execFile, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { getSetting, setSetting } from '../db/settings.ts';

const ROOT_DIR = process.cwd();
const BIN_DIR = path.resolve(ROOT_DIR, 'bin');
const ZROK_BIN_PATH = path.resolve(BIN_DIR, 'zrok2');
const ZROK_HOME_DIR = path.resolve(ROOT_DIR, '.zrok_data');
const ZROK_ENV_DESC = 'WhatsOmni-AI-Cloud';
const ZROK_DOWNLOAD_URL =
  'https://github.com/openziti/zrok/releases/download/v2.0.9/zrok_2.0.9_linux_amd64.tar.gz';

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
let zrokRunning = false;
let zrokPublicUrl: string | null = null;
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

    // Fallback check top-level names array if present in schema
    if (Array.isArray(raw?.names)) {
      for (const n of raw.names) {
        const nameVal = String(n?.name || '').trim().toLowerCase();
        const nsName = String(n?.namespaceName || n?.namespaceToken || '').toLowerCase();
        if (nameVal && (!nsName || nsName === 'public')) {
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

    if (isStaleWhatsOmniEnv) {
      for (const sh of env.shares) {
        try {
          await execZrok(['delete', 'share', sh.shareToken, '--envzid', env.envZId], 8000);
          pushZrokLog(`Sters share Zrok vechi (${sh.shareToken}) din mediul ${env.envZId}.`);
        } catch {}
      }
      try {
        await execZrok(['delete', 'environment', env.envZId, '--force'], 10000);
        pushZrokLog(`Curățat mediu Zrok duplicat (${env.envZId}).`);
      } catch (err: any) {
        pushZrokLog(`Notă curățare mediu ${env.envZId}: ${err?.message || 'ignorat'}`);
      }
      continue;
    }

    for (const sh of env.shares) {
      const holdsTargetName =
        Boolean(normalizedCustom) &&
        sh.frontendEndpoints.some((u) => {
          const clean = u.toLowerCase();
          return (
            clean.includes(`//${normalizedCustom}.`) ||
            clean.startsWith(`${normalizedCustom}.`)
          );
        });

      const isCurrentEnvShare = Boolean(currentEnvZId) && env.envZId === currentEnvZId && deleteSharesInCurrentEnv;

      if (isCurrentEnvShare || holdsTargetName) {
        try {
          await execZrok(['delete', 'share', sh.shareToken, '--envzid', env.envZId], 8000);
          pushZrokLog(
            holdsTargetName
              ? `Eliberat numele "${normalizedCustom}" de pe conexiunea veche (${sh.shareToken}) pentru conectare directă.`
              : `Curățat share Zrok rezidual (${sh.shareToken}) din mediul curent.`
          );
        } catch {}
      }
    }
  }
}

async function stopTunnelProcessOnly(): Promise<void> {
  if (zrokProcess) {
    pushZrokLog('Se oprește tunelul Zrok...');
    const proc = zrokProcess;
    zrokProcess = null;
    zrokRunning = false;
    zrokPublicUrl = null;
    try {
      proc.kill('SIGINT');
      await new Promise((r) => setTimeout(r, 900));
      try {
        if (!proc.killed) proc.kill('SIGTERM');
      } catch {}
    } catch {}
  } else {
    zrokRunning = false;
    zrokPublicUrl = null;
  }
}

async function buildStatusSnapshot(): Promise<ZrokStatusSnapshot> {
  const settings = await loadZrokSettings();
  const activeToken = (settings.token || process.env.ZROK_TOKEN || '').trim();
  const binaryInstalled = fs.existsSync(ZROK_BIN_PATH);
  const [version, isEnabled] = await Promise.all([getZrokVersion(), checkZrokEnabled()]);

  return {
    binaryInstalled,
    version,
    isEnabled,
    isRunning: zrokRunning && !!zrokProcess,
    publicUrl: zrokPublicUrl,
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
  opts?: { customName?: string; basicAuth?: string; autoStart?: boolean; token?: string }
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

  if (cleanBasicAuth && cleanBasicAuth.includes(':')) {
    args.push('--basic-auth', cleanBasicAuth);
  }

  const spawnOnce = (allowRetry: boolean): Promise<ZrokStatusSnapshot> => {
    pushZrokLog(`Se pornește tunelul Zrok spre ${targetUrl}...`);

    return new Promise((resolve, reject) => {
      let settled = false;
      let staleShareToken: string | null = null;
      let overviewCheckTimer: ReturnType<typeof setTimeout> | null = null;

      const clearTimers = () => {
        clearTimeout(startupTimer);
        if (overviewCheckTimer) clearTimeout(overviewCheckTimer);
      };

      const finishSuccess = async () => {
        if (settled) return;
        settled = true;
        clearTimers();
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

      const handleChunk = (data: Buffer) => {
        const text = data.toString();
        const lines = text.split(/\r?\n/);
        for (const line of lines) {
          const cleanLine = line.replace(/\x1b\[[0-9;]*m/g, '').trim();
          if (!cleanLine) continue;
          pushZrokLog(cleanLine);

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
        pushZrokLog(`EROARE proces zrok2: ${err.message}`);
        finishError(err.message);
      });

      proc.on('exit', async (code, signal) => {
        const wasStarting = !settled;
        zrokRunning = false;
        if (zrokProcess === proc) {
          zrokProcess = null;
          zrokPublicUrl = null;
        }
        pushZrokLog(`Tunel Zrok oprit (cod=${code ?? 'null'}, signal=${signal ?? 'none'}).`);

        if (wasStarting && allowRetry && (staleShareToken || cleanCustomName)) {
          settled = true;
          clearTimers();
          try {
            pushZrokLog(
              `Se eliberează automat conexiunea veche (${staleShareToken || cleanCustomName}) și se reconectează direct...`
            );
            let released = false;

            // Find exact owning envZId from overview --json so cross-env share deletion succeeds
            const overview = await getOverviewJson();
            if (overview && staleShareToken) {
              for (const env of overview.environments) {
                if (env.shares.some((s) => s.shareToken === staleShareToken)) {
                  try {
                    await execZrok(['delete', 'share', staleShareToken, '--envzid', env.envZId], 10000);
                    released = true;
                  } catch {}
                  if (!released && env.description === ZROK_ENV_DESC && env.envZId !== currentLocalEnv?.envZId) {
                    try {
                      await execZrok(['delete', 'environment', env.envZId, '--force'], 10000);
                      released = true;
                    } catch {}
                  }
                }
              }
            }

            if (!released && staleShareToken) {
              try {
                await execZrok(['delete', 'share', staleShareToken], 10000);
                released = true;
              } catch {}
            }

            if (!released && cleanCustomName) {
              try {
                await execZrok(['delete', 'share', `public:${cleanCustomName}`], 10000);
                released = true;
              } catch {}
            }

            if (!released && cleanCustomName) {
              // Last-resort fallback only if name is actively locked on another un-deletable external device
              const nIdx = args.indexOf('-n');
              if (nIdx !== -1) {
                args.splice(nIdx, 2);
                pushZrokLog(
                  `Numele "${cleanCustomName}" este activ pe alt dispozitiv extern; se pornește cu adresă Zrok temporară...`
                );
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

  try {
    console.log('[ZROK] Auto-starting public Zrok tunnel for entire site...');
    const status = await startZrokTunnel(port);
    if (status.publicUrl) {
      console.log(`[ZROK] Entire site is LIVE on Zrok: ${status.publicUrl}`);
    }
  } catch (err: any) {
    console.warn('[ZROK] Auto-start failed:', err?.message || err);
  }
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
    try {
      const liveRes = await fetch(`${normalizedLiveUrl}/api/health`, {
        signal: AbortSignal.timeout(8000),
      });
      const liveJson: any = await liveRes.json().catch(() => ({}));
      const liveOk = liveRes.ok && liveJson?.ok === true;
      checks.push({
        id: 'tunnel_live',
        name: 'Test End-to-End Link Public Zrok',
        passed: liveOk,
        status: liveOk ? 'PASS' : 'FAIL',
        details: liveOk
          ? `Site-ul răspunde live prin internet la ${normalizedLiveUrl} (HTTP ${liveRes.status}).`
          : `Tunelul a returnat HTTP ${liveRes.status} la ${normalizedLiveUrl}`,
        durationMs: Date.now() - t5,
      });
    } catch (err: any) {
      checks.push({
        id: 'tunnel_live',
        name: 'Test End-to-End Link Public Zrok',
        passed: false,
        status: 'FAIL',
        details: `Nu s-a putut accesa ${normalizedLiveUrl}: ${err?.message || 'eroare'}`,
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
