import React, { useState, useEffect, useRef } from 'react';
import { 
  QrCode, MessageCircle, RefreshCw, CheckCircle2, Smartphone, 
  ShieldCheck, Sparkles, LogOut, Bot, Check, Upload, Image, 
  KeyRound, ArrowLeftRight, Copy, CheckCheck, UserCheck, Cloud,
  Cpu, Zap, Brain, Sliders, Database, Lock, User, LogIn,
  Terminal, Monitor, Wrench, Activity, Play, ShieldAlert, CheckCircle,
  Crown, Star, Filter, Plus, Trash2, X, UserPlus, Search, Shield, Eye,
  Shuffle, Flame, Layers, Globe, ExternalLink, Square
} from 'lucide-react';
import { auth, googleAuthProvider } from './lib/firebase.ts';
import { onAuthStateChanged, signInWithPopup, signOut, User as FirebaseUser } from 'firebase/auth';

export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

export interface VipContact {
  jid: string;
  name: string;
  phone?: string;
  addedAt: string;
}

interface WhatsAppStatus {
  isConnected: boolean;
  isRegistered?: boolean;
  connectionMethod?: 'qr' | 'pairing';
  qrCodeUrl: string | null;
  pairingCode: string | null;
  pairingPhone?: string | null;
  userPhone: string | null;
  userName: string | null;
  connectedAt: string | null;
  currentAvatarUrl?: string;
  lastAvatarUpdated?: string | null;
  avatarCooldownRemaining?: number;
  avatarBatch?: string[];
  avatarBatchApplied?: string[];
  avatarBatchNumber?: number;
  avatarActiveThemeQuery?: string;
  logs: Array<{
    id: string;
    sender: 'contact' | 'ai' | 'system';
    from: string;
    text: string;
    time: string;
  }>;
}

interface AISettings {
  mode: 'ensemble' | 'flash' | 'lite';
  systemInstruction: string;
  autoAvatarEnabled: boolean;
  autoAvatarQuery: string;
  autoAvatarIntervalMinutes: number;
}

interface CloudSqlStats {
  success: boolean;
  database: string;
  status: string;
  uptimeSeconds: number;
  totalPersistedMessages: number;
  lastHeartbeat: any;
}

interface PersistentMessage {
  id: number;
  msgId: string;
  sender: string;
  senderName: string | null;
  text: string;
  aiReply: string | null;
  modelUsed: string | null;
  isFromMe: boolean;
  createdAt: string;
}

interface ZrokStatus {
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

export default function App() {
  const [activeTab, setActiveTab] = useState<'connect' | 'avatar' | 'ai' | 'cd' | 'zrok'>('connect');
  const [zrokStatus, setZrokStatus] = useState<ZrokStatus | null>(null);
  const [zrokTokenInput, setZrokTokenInput] = useState('');
  const [zrokCustomNameInput, setZrokCustomNameInput] = useState('');
  const [zrokBasicAuthInput, setZrokBasicAuthInput] = useState('');
  const [zrokAutoStartInput, setZrokAutoStartInput] = useState(false);
  const [zrokActionLoading, setZrokActionLoading] = useState(false);
  const [zrokCopiedUrl, setZrokCopiedUrl] = useState(false);
  const [zrokTestLoading, setZrokTestLoading] = useState(false);
  const [zrokTestReport, setZrokTestReport] = useState<{
    success: boolean;
    overallStatus: string;
    checkedAt: string;
    checks: Array<{
      id: string;
      name: string;
      passed: boolean;
      status: 'PASS' | 'WARN' | 'FAIL';
      details: string;
      durationMs: number;
    }>;
  } | null>(null);
  const [user, setUser] = useState<AppUser | FirebaseUser | null>(() => {
    try {
      const cached = localStorage.getItem('alexia_active_user');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [authLoading, setAuthLoading] = useState<boolean>(() => {
    try {
      return !localStorage.getItem('alexia_active_user');
    } catch {
      return true;
    }
  });
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  // VIP Contacts State
  const [vipContacts, setVipContacts] = useState<VipContact[]>([]);
  const [vipFilterOnly, setVipFilterOnly] = useState(false);
  const [showAddVipModal, setShowAddVipModal] = useState(false);
  const [newVipPhone, setNewVipPhone] = useState('');
  const [newVipName, setNewVipName] = useState('');
  const [vipActionLoading, setVipActionLoading] = useState(false);

  const [status, setStatus] = useState<WhatsAppStatus>({
    isConnected: false,
    isRegistered: false,
    connectionMethod: 'qr',
    qrCodeUrl: null,
    pairingCode: null,
    userPhone: null,
    userName: null,
    connectedAt: null,
    logs: [],
  });

  const [persistentMessages, setPersistentMessages] = useState<PersistentMessage[]>([]);
  const [cloudSqlStats, setCloudSqlStats] = useState<CloudSqlStats | null>(null);

  const [loading, setLoading] = useState(false);
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Connection mode switch: 'qr' vs 'pairing'
  const [activeMethod, setActiveMethod] = useState<'qr' | 'pairing'>('qr');
  const [appTypeGuide, setAppTypeGuide] = useState<'messenger' | 'business'>('messenger');
  const [phoneNumberInput, setPhoneNumberInput] = useState('');
  const [pairingError, setPairingError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  // Profile Picture state
  const [currentAvatarUrl, setCurrentAvatarUrl] = useState('https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=640&auto=format&fit=crop&q=85');
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [generatingAvatar, setGeneratingAvatar] = useState(false);
  const [updatingAvatar, setUpdatingAvatar] = useState(false);
  const [selectedThemeCategory, setSelectedThemeCategory] = useState('Peisaje');
  const [activeThemeQuery, setActiveThemeQuery] = useState('peisaj natura landscape munte apus');
  const [customSearchQuery, setCustomSearchQuery] = useState('');
  const [galleryPageOffset, setGalleryPageOffset] = useState(0);
  const [appliedInBatch, setAppliedInBatch] = useState<string[]>([]);
  const [seenGalleryUrls, setSeenGalleryUrls] = useState<string[]>([]);
  const [autoNextBatchAfter5, setAutoNextBatchAfter5] = useState(true);
  const [themeGroupFilter, setThemeGroupFilter] = useState<'all' | 'popular' | 'scifi' | 'fantasy' | 'anomalies' | 'style'>('all');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const avatarInitializedRef = useRef(false);

  // Catalog exhaustiv cu toate temele posibile și imposibile
  const ALL_THEMES = [
    // 1. Populare & Clasice
    { id: 'Peisaje', label: '🏞️ Peisaje & Natură', query: 'peisaj natura landscape munte apus', group: 'popular' },
    { id: 'Mașini', label: '🏎️ Supercars & Viteză', query: 'supercar masini ferrari porsche lamborghini', group: 'popular' },
    { id: 'Cyberpunk', label: '🤖 Cyberpunk 2077', query: 'cyberpunk neon robot viitor', group: 'popular' },
    { id: 'ZeroTwo', label: '🌸 Zero Two (Darling Anime)', query: 'zero two darling in the franxx anime pink hair waifu', group: 'popular' },
    { id: 'Animale', label: '🐾 Animale & Feline', query: 'animale lup leu tigru pantera wildlife', group: 'popular' },
    { id: 'Spațiu', label: '🌌 Spațiu & Galaxii', query: 'spatiu galaxie cosmos james webb univers', group: 'popular' },
    { id: 'Anime', label: '⚡ Anime & Shonen', query: 'anime gaming manga shonen', group: 'popular' },
    { id: 'Oraș', label: '🏙️ Metropole Nocturne', query: 'oras tokyo skyline new york noapte', group: 'popular' },

    // 2. Sci-Fi & Viitor (La Limita Posibilului)
    { id: 'Matrix', label: '💻 Hacking & Matrix', query: 'hack matrix cod cyberwar terminal', group: 'scifi' },
    { id: 'Nave', label: '🛸 Nave & Stații Orbitale', query: 'nave spatiale statie orbitala starship', group: 'scifi' },
    { id: 'Solarpunk', label: '🔋 Solarpunk & Megastructuri', query: 'solarpunk sfere dyson orase plutitoare', group: 'scifi' },

    // 3. Fantastic, Mitologie & Supranatural
    { id: 'Dragoni', label: '🐉 Dragoni & Bestii Mitice', query: 'dragon dragoni balaur fenix phoenix', group: 'fantasy' },
    { id: 'DarkFantasy', label: '⚔️ Dark Fantasy & Souls', query: 'dark fantasy elden souls gotic cavaler armura', group: 'fantasy' },
    { id: 'Magie', label: '🧙 Magie & Runice Arcane', query: 'magie vrajitor arcane wizard rune portal', group: 'fantasy' },
    { id: 'Zei', label: '⚡ Zei Mitologici', query: 'zeu zeus thor odin anubis olimp asgard', group: 'fantasy' },
    { id: 'Vampiri', label: '🦇 Castele & Vampiri', query: 'vampir castel gotic noapte transilvania', group: 'fantasy' },

    // 4. Anomalii, SCP & Dimensiuni Paralele (Total Imposibil)
    { id: 'SCP', label: '🕵️ SCP Foundation (Keter)', query: 'scp keter euclid containment dosar secret', group: 'anomalies' },
    { id: 'Portale', label: '🌀 Găuri de Vierme & Portale', query: 'gaura de vierme wormhole portal interdimensional', group: 'anomalies' },
    { id: 'Cthulhu', label: '👁️ Cosmic Horror & Cthulhu', query: 'cthulhu lovecraft eldritch monstru marin', group: 'anomalies' },
    { id: 'Abis', label: '🕳️ Abis Subacvatic & Fosa', query: 'abis ocean adanc fosa marianelor kraken', group: 'anomalies' },
    { id: 'Backrooms', label: '📺 Glitch Art & Backrooms', query: 'glitch vaporwave backrooms liminal vhs', group: 'anomalies' },
    { id: 'Lava', label: '🌋 Planete de Lavă & Vulcan', query: 'apocalips lava vulcan planeta extraterestra foc', group: 'anomalies' },

    // 5. Stil, Pasiuni & Cultură
    { id: 'Samurai', label: '🥋 Samurai & Katana', query: 'samurai katana ninja ronin bushido', group: 'style' },
    { id: 'Sport', label: '⚽ Sport & Campioni Fitness', query: 'sport fotbal box mma gym sala motivatie', group: 'style' },
    { id: 'Muzica', label: '🎸 Rock, Rap & DJ Neon', query: 'muzica rock dj chitara concert beat', group: 'style' },
    { id: 'Minimalist', label: '🕶️ Dark Luxury & Obsidian', query: 'minimal luxury aur obsidian black aesthetic ceas', group: 'style' },
  ];

  // Multi-AI Settings state ("Pentru răspunsuri pe WhatsApp să folosești toți AI")
  const [aiSettings, setAiSettings] = useState<AISettings>({
    mode: 'ensemble',
    systemInstruction: 'Ești Alexandru. Când scrii pe WhatsApp, vorbești exact așa cum scrii tu de obicei: direct, amical, natural, scurt (1-2 fraze) în limba română. Păstrează ideea și intenția mesajului primit, dar răspunde exact cum ar scrie un om real de pe telefon pe WhatsApp. Nu folosi etichete de bot, introduceri artificiale sau limbaj robotic.',
    autoAvatarEnabled: true,
    autoAvatarQuery: 'pinterest aesthetic wallpaper',
    autoAvatarIntervalMinutes: 5,
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [autoTimerSeconds, setAutoTimerSeconds] = useState(300);

  // Automatic 5-minute timer that automatically triggers "Schimbă Instant cu Următoarea Poză din Lot"
  useEffect(() => {
    const timer = setInterval(() => {
      setAutoTimerSeconds(prev => {
        if (prev <= 1) {
          if (status.isConnected) {
            console.log('[AUTO_5MIN_TIMER] Auto-triggering next avatar in batch...');
            handleTriggerAutoAvatar();
          }
          return 300; // Reset timer to 5 minutes (300 seconds)
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [status.isConnected]);

  const formatCountdown = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // AI Sandbox Testing state
  const [testMsgInput, setTestMsgInput] = useState('Salut @Alexandru, cum mă poți ajuta?');
  const [testMsgLoading, setTestMsgLoading] = useState(false);
  const [testMsgReply, setTestMsgReply] = useState<{ text: string; modelUsed: string } | null>(null);

  // AI Agent "cd" Autonomous Terminal State
  const [cdCommand, setCdCommand] = useState('');
  const [cdExecuting, setCdExecuting] = useState(false);
  const [cdStatus, setCdStatus] = useState<any>(null);
  const [cdTerminalLogs, setCdTerminalLogs] = useState<Array<{ id: string; text: string; sender: 'user' | 'cd' | 'system'; time: string }>>([
    {
      id: 'init_1',
      text: 'AI Agent "cd" Kernel v3.8 Autonomous PC Workstation initialized.',
      sender: 'system',
      time: new Date().toLocaleTimeString(),
    },
    {
      id: 'init_2',
      text: 'Sunt AI "cd". Monitorizez sistemul, scriu cod, rulez teste și rezolv autonom orice problemă! Tastează "cd fix" pentru auto-reparare sau pune-mi orice întrebare de programare.',
      sender: 'cd',
      time: new Date().toLocaleTimeString(),
    },
  ]);

  const inFlightRequestsRef = useRef<Set<string>>(new Set());

  const fetchJsonSafe = async <T = any>(
    url: string,
    options?: RequestInit,
    timeoutMs: number = 9000
  ): Promise<{ ok: boolean; data?: T; transient?: boolean }> => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return { ok: false, transient: true };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || !contentType.includes('application/json')) {
        if ([502, 503, 504, 429].includes(res.status) || !contentType.includes('application/json')) {
          return { ok: false, transient: true };
        }
        return { ok: false };
      }
      const data = (await res.json()) as T;
      return { ok: true, data };
    } catch {
      return { ok: false, transient: true };
    } finally {
      clearTimeout(timer);
    }
  };

  const fetchCdStatus = async () => {
    if (inFlightRequestsRef.current.has('cd')) return;
    inFlightRequestsRef.current.add('cd');
    try {
      const result = await fetchJsonSafe<any>('/api/cd/status');
      if (result.ok && result.data?.success) {
        setCdStatus(result.data);
      }
    } finally {
      inFlightRequestsRef.current.delete('cd');
    }
  };

  const handleExecuteCdCommand = async (cmdToRun?: string) => {
    const targetCmd = cmdToRun || cdCommand;
    if (!targetCmd || !targetCmd.trim()) return;

    const timeStr = new Date().toLocaleTimeString();
    const userLog = { id: Date.now().toString(), text: targetCmd, sender: 'user' as const, time: timeStr };

    setCdTerminalLogs(prev => [...prev, userLog]);
    if (!cmdToRun) setCdCommand('');
    setCdExecuting(true);

    if (targetCmd.trim().toLowerCase() === 'cd clear' || targetCmd.trim().toLowerCase() === 'clear') {
      setCdTerminalLogs([
        { id: Date.now().toString(), text: 'Consolă curățată de AI "cd".', sender: 'system', time: timeStr },
      ]);
      setCdExecuting(false);
      return;
    }

    try {
      const res = await fetch('/api/cd/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: targetCmd }),
      });
      const data = await res.json();
      if (data.success && data.output) {
        setCdTerminalLogs(prev => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            text: data.output,
            sender: 'cd',
            time: new Date().toLocaleTimeString(),
          },
        ]);
      } else {
        setCdTerminalLogs(prev => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            text: `[Eroare cd]: ${data.error || 'Nu s-a putut executa comanda'}`,
            sender: 'system',
            time: new Date().toLocaleTimeString(),
          },
        ]);
      }
    } catch (err) {
      setCdTerminalLogs(prev => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          text: '[Eroare Rețea]: Nu s-a putut comunica cu nucleul AI "cd".',
          sender: 'system',
          time: new Date().toLocaleTimeString(),
        },
      ]);
    } finally {
      setCdExecuting(false);
      fetchCdStatus();
    }
  };

  const handleRunCdAutoHeal = async () => {
    setCdExecuting(true);
    const timeStr = new Date().toLocaleTimeString();
    setCdTerminalLogs(prev => [
      ...prev,
      { id: Date.now().toString(), text: '[AUTONOMOUS_REPAIR] AI "cd" declanșează auto-repararea sistemului...', sender: 'system', time: timeStr },
    ]);
    try {
      const res = await fetch('/api/cd/auto-heal', { method: 'POST' });
      const data = await res.json();
      if (data.success && data.logs) {
        setCdTerminalLogs(prev => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            text: data.logs.join('\n'),
            sender: 'cd',
            time: new Date().toLocaleTimeString(),
          },
        ]);
        setActionNotice({ type: 'success', text: '✅ Diagnosticul și auto-repararea au fost executate de AI "cd"!' });
      }
    } catch (e) {
      setActionNotice({ type: 'error', text: 'Eroare la auto-reparare AI cd.' });
    } finally {
      setCdExecuting(false);
      fetchCdStatus();
      fetchStatus();
    }
  };

  const handleTestAiReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testMsgInput.trim()) return;
    setTestMsgLoading(true);
    setTestMsgReply(null);
    try {
      const res = await fetch('/api/ai/test-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: testMsgInput, senderName: user?.displayName || 'Alexandru' }),
      });
      const data = await res.json();
      if (data.success) {
        setTestMsgReply({ text: data.text, modelUsed: data.modelUsed });
      } else {
        setActionNotice({ type: 'error', text: data.error || 'Eroare la testare AI.' });
      }
    } catch (err) {
      setActionNotice({ type: 'error', text: 'Eroare de comunicare cu serverul.' });
    } finally {
      setTestMsgLoading(false);
    }
  };

  const loadPinterestGallery = async (customQuery?: string, isNextPage: boolean = false) => {
    setGeneratingAvatar(true);
    const queryToUse = (customQuery || customSearchQuery || activeThemeQuery || selectedThemeCategory || aiSettings.autoAvatarQuery || 'peisaj natura').trim();
    if (customQuery) {
      setActiveThemeQuery(customQuery.trim());
    }
    const nextOffset = isNextPage ? galleryPageOffset + 1 : 0;
    setGalleryPageOffset(nextOffset);
    const excludeList = isNextPage ? seenGalleryUrls : [];

    try {
      const res = await fetch('/api/ai/search-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: queryToUse,
          offset: nextOffset,
          excludeUrls: excludeList,
          syncTheme: true,
        }),
      });
      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || !contentType.includes('application/json')) {
        throw new Error('Serverul nu a putut prelua imaginile acum.');
      }
      const data = await res.json();
      if (data.images && data.images.length > 0) {
        const images5: string[] = data.images.slice(0, 5);
        setSearchResults(images5);
        setAppliedInBatch([]);
        setSeenGalleryUrls(prev => (isNextPage ? [...prev, ...images5].slice(-150) : images5));
        setCurrentAvatarUrl(images5[0]);
        if (data.syncedTheme) {
          setAiSettings(prev => ({ ...prev, autoAvatarQuery: data.syncedTheme }));
        }
      }
    } catch (e) {
      console.error('Load gallery error:', e);
    } finally {
      setGeneratingAvatar(false);
    }
  };

  const handleRandomTheme = () => {
    const randomTheme = ALL_THEMES[Math.floor(Math.random() * ALL_THEMES.length)];
    setSelectedThemeCategory(randomTheme.id);
    setActiveThemeQuery(randomTheme.query);
    setCustomSearchQuery('');
    loadPinterestGallery(randomTheme.query, false);
    setActionNotice({ type: 'info', text: `🎲 Temă aleatorie activată: "${randomTheme.label}"! S-au descărcat 5 poze noi.` });
  };

  // Auto-fetch 5 images when opening profile picture tab
  useEffect(() => {
    if (activeTab === 'avatar' && searchResults.length === 0) {
      loadPinterestGallery(activeThemeQuery || selectedThemeCategory);
    }
  }, [activeTab]);

  // Poll AI "cd" status when activeTab is 'cd'
  useEffect(() => {
    if (activeTab === 'cd') {
      fetchCdStatus();
      const interval = setInterval(fetchCdStatus, 4000);
      return () => clearInterval(interval);
    }
  }, [activeTab]);

  const zrokPrefilledRef = useRef(false);
  const fetchZrokStatus = async () => {
    try {
      const res = await fetchJsonSafe('/api/zrok/status');
      if (res.ok && res.data?.success) {
        const zData = res.data as ZrokStatus;
        setZrokStatus(zData);
        if (!zrokPrefilledRef.current) {
          zrokPrefilledRef.current = true;
          if (zData.customName) setZrokCustomNameInput(zData.customName);
          setZrokAutoStartInput(Boolean(zData.autoStart));
        }
      }
    } catch {}
  };

  useEffect(() => {
    if (activeTab === 'zrok') {
      fetchZrokStatus();
      const interval = setInterval(fetchZrokStatus, 4000);
      return () => clearInterval(interval);
    }
  }, [activeTab]);

  const handleEnableZrok = async () => {
    if (!zrokTokenInput.trim()) {
      setActionNotice({ type: 'error', text: 'Introdu tokenul tău Zrok (obținut din contul zrok.io).' });
      return;
    }
    setZrokActionLoading(true);
    try {
      const res = await fetch('/api/zrok/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: zrokTokenInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Activarea Zrok a eșuat.');
      }
      setZrokStatus(data);
      setZrokTokenInput('');
      setActionNotice({ type: 'success', text: 'Zrok a fost activat cu succes! Acum poți porni site-ul public pe Zrok.' });
    } catch (err: any) {
      setActionNotice({ type: 'error', text: `Zrok: ${err.message}` });
    } finally {
      setZrokActionLoading(false);
    }
  };

  const handleStartZrok = async () => {
    setZrokActionLoading(true);
    setActionNotice({ type: 'info', text: 'Se pornește tunelul public Zrok pentru întregul site...' });
    try {
      const res = await fetch('/api/zrok/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: zrokTokenInput.trim() || undefined,
          customName: zrokCustomNameInput.trim(),
          basicAuth: zrokBasicAuthInput.trim(),
          autoStart: zrokAutoStartInput,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Nu s-a putut porni tunelul Zrok.');
      }
      setZrokStatus(data);
      if (zrokTokenInput.trim()) setZrokTokenInput('');
      setActionNotice({
        type: 'success',
        text: data.publicUrl
          ? `Site-ul este LIVE pe Zrok: ${data.publicUrl}`
          : 'Tunelul Zrok a pornit! Aștept alocarea adresei publice...',
      });
    } catch (err: any) {
      setActionNotice({ type: 'error', text: `Zrok: ${err.message}` });
      await fetchZrokStatus();
    } finally {
      setZrokActionLoading(false);
    }
  };

  const handleStopZrok = async () => {
    setZrokActionLoading(true);
    try {
      const res = await fetch('/api/zrok/stop', { method: 'POST' });
      const data = await res.json();
      setZrokStatus(data);
      setActionNotice({ type: 'info', text: 'Tunelul Zrok a fost oprit.' });
    } catch (err: any) {
      setActionNotice({ type: 'error', text: `Zrok: ${err.message}` });
    } finally {
      setZrokActionLoading(false);
    }
  };

  const handleDisableZrok = async () => {
    setZrokActionLoading(true);
    try {
      const res = await fetch('/api/zrok/disable', { method: 'POST' });
      const data = await res.json();
      setZrokStatus(data);
      setZrokCustomNameInput('');
      setZrokBasicAuthInput('');
      setZrokAutoStartInput(false);
      setActionNotice({ type: 'info', text: 'Mediul Zrok a fost dezactivat și tokenul a fost șters.' });
    } catch (err: any) {
      setActionNotice({ type: 'error', text: `Zrok: ${err.message}` });
    } finally {
      setZrokActionLoading(false);
    }
  };

  const handleCopyZrokUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setZrokCopiedUrl(true);
    setTimeout(() => setZrokCopiedUrl(false), 2500);
  };

  const handleTestZrok = async () => {
    setZrokTestLoading(true);
    try {
      const res = await fetch('/api/zrok/test', { method: 'POST' });
      const data = await res.json();
      setZrokTestReport(data);
      await fetchZrokStatus();
      setActionNotice({
        type: data.overallStatus === 'ISSUE' ? 'error' : 'success',
        text:
          data.overallStatus === 'LIVE'
            ? 'Test Zrok complet: Site-ul răspunde LIVE prin tunelul public Zrok!'
            : data.overallStatus === 'ISSUE'
            ? 'Test Zrok a detectat o problemă. Verifică lista de diagnostic de mai jos.'
            : 'Test Zrok finalizat: Binarul, conexiunea cloud și proxy-ul funcționează corect!',
      });
    } catch (err: any) {
      setActionNotice({ type: 'error', text: `Eroare test Zrok: ${err?.message || 'necunoscută'}` });
    } finally {
      setZrokTestLoading(false);
    }
  };

  // Auth Listener with Safety Timeout & Instant Local Storage Support
  useEffect(() => {
    // Instant check from localStorage
    try {
      const cached = localStorage.getItem('alexia_active_user');
      if (cached) {
        setUser(JSON.parse(cached));
        setAuthLoading(false);
      }
    } catch (e) {}

    // Safety timeout: Never leave the user stuck on "Se încarcă securitatea..."
    const safetyTimer = setTimeout(() => {
      setAuthLoading(false);
    }, 1800);

    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      clearTimeout(safetyTimer);
      if (u) {
        const uData: AppUser = {
          uid: u.uid,
          email: u.email,
          displayName: u.displayName,
          photoURL: u.photoURL,
        };
        try {
          localStorage.setItem('alexia_active_user', JSON.stringify(uData));
        } catch (e) {}
        setUser(u);
      }
      setAuthLoading(false);
      if (u) {
        try {
          const token = await u.getIdToken();
          await fetchJsonSafe('/api/auth/sync', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
          });
        } catch {
          // Non-fatal auth sync during startup/offline
        }
      }
    });

    return () => {
      clearTimeout(safetyTimer);
      unsubscribe();
    };
  }, []);

  // Poll status every 3s when tab is visible, with overlap protection
  useEffect(() => {
    if (!user) return;
    const runFastPoll = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      fetchStatus();
      fetchCloudSqlStats();
    };
    const runSlowPoll = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      fetchPersistentMessages();
      fetchVipContacts();
    };

    fetchStatus();
    fetchAISettings();
    fetchCloudSqlStats();
    fetchPersistentMessages();
    fetchVipContacts();
    fetchZrokStatus();

    const fastInterval = setInterval(runFastPoll, 3000);
    const slowInterval = setInterval(runSlowPoll, 8000);

    const handleResume = () => {
      if (document.visibilityState === 'visible') {
        fetchStatus();
        fetchCloudSqlStats();
        fetchPersistentMessages();
        fetchVipContacts();
      }
    };
    document.addEventListener('visibilitychange', handleResume);
    window.addEventListener('online', handleResume);

    return () => {
      clearInterval(fastInterval);
      clearInterval(slowInterval);
      document.removeEventListener('visibilitychange', handleResume);
      window.removeEventListener('online', handleResume);
    };
  }, [user]);

  const fetchStatus = async () => {
    if (inFlightRequestsRef.current.has('status')) return;
    inFlightRequestsRef.current.add('status');
    try {
      const result = await fetchJsonSafe<WhatsAppStatus>('/api/whatsapp/status');
      if (result.ok && result.data) {
        setStatus(result.data);
        if (result.data.currentAvatarUrl && !avatarInitializedRef.current) {
          setCurrentAvatarUrl(result.data.currentAvatarUrl);
          avatarInitializedRef.current = true;
        }
        if (result.data.pairingPhone) {
          setPhoneNumberInput(prev => prev || result.data!.pairingPhone || '');
        }
        if (result.data.pairingCode) {
          setActiveMethod('pairing');
        }
      }
    } finally {
      inFlightRequestsRef.current.delete('status');
    }
  };

  const fetchAISettings = async () => {
    if (inFlightRequestsRef.current.has('ai_settings')) return;
    inFlightRequestsRef.current.add('ai_settings');
    try {
      const result = await fetchJsonSafe<AISettings>('/api/ai/settings');
      if (result.ok && result.data) {
        setAiSettings(result.data);
      }
    } finally {
      inFlightRequestsRef.current.delete('ai_settings');
    }
  };

  const fetchCloudSqlStats = async () => {
    if (inFlightRequestsRef.current.has('cloudsql')) return;
    inFlightRequestsRef.current.add('cloudsql');
    try {
      const result = await fetchJsonSafe<CloudSqlStats>('/api/cloudsql/stats');
      if (result.ok && result.data) {
        setCloudSqlStats(result.data);
      }
    } finally {
      inFlightRequestsRef.current.delete('cloudsql');
    }
  };

  const fetchPersistentMessages = async () => {
    if (inFlightRequestsRef.current.has('messages')) return;
    inFlightRequestsRef.current.add('messages');
    try {
      const result = await fetchJsonSafe<{ success: boolean; messages: PersistentMessage[] }>('/api/whatsapp/messages?limit=50');
      if (result.ok && result.data?.success && Array.isArray(result.data.messages)) {
        setPersistentMessages(result.data.messages);
      }
    } finally {
      inFlightRequestsRef.current.delete('messages');
    }
  };

  const fetchVipContacts = async () => {
    if (inFlightRequestsRef.current.has('vip')) return;
    inFlightRequestsRef.current.add('vip');
    try {
      const result = await fetchJsonSafe<{ success: boolean; contacts: VipContact[] }>('/api/contacts/vip');
      if (result.ok && result.data?.success && result.data.contacts) {
        setVipContacts(result.data.contacts);
      }
    } finally {
      inFlightRequestsRef.current.delete('vip');
    }
  };

  const isVipContact = (sender: string, senderName?: string | null): boolean => {
    if (!sender && !senderName) return false;
    const cleanSender = (sender || '').replace(/[^0-9]/g, '');
    return vipContacts.some(v => {
      if (v.jid && (v.jid === sender || sender.includes(v.jid) || v.jid.includes(sender))) return true;
      const cleanVipPhone = (v.phone || '').replace(/[^0-9]/g, '');
      if (cleanVipPhone && cleanSender && (cleanSender.includes(cleanVipPhone) || cleanVipPhone.includes(cleanSender))) return true;
      if (v.name && senderName && v.name.trim().toLowerCase() === senderName.trim().toLowerCase()) return true;
      return false;
    });
  };

  const handleToggleVip = async (sender: string, senderName?: string | null) => {
    setVipActionLoading(true);
    try {
      const res = await fetch('/api/contacts/vip/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jid: sender, name: senderName || sender }),
      });
      const data = await res.json();
      if (data.success) {
        setVipContacts(data.contacts);
        setActionNotice({
          type: 'success',
          text: data.isVip
            ? `👑 Contactul "${senderName || sender}" a fost marcat ca VIP!`
            : `Contactul "${senderName || sender}" a fost eliminat din lista VIP.`
        });
      }
    } catch (e) {
      console.error('Toggle VIP error:', e);
      setActionNotice({ type: 'error', text: 'Eroare la modificarea statusului VIP' });
    } finally {
      setVipActionLoading(false);
    }
  };

  const handleAddVipManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVipPhone.trim() && !newVipName.trim()) return;
    setVipActionLoading(true);
    try {
      const res = await fetch('/api/contacts/vip/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: newVipPhone.trim(),
          name: newVipName.trim() || newVipPhone.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setVipContacts(data.contacts);
        setNewVipPhone('');
        setNewVipName('');
        setShowAddVipModal(false);
        setActionNotice({ type: 'success', text: `👑 Contactul VIP a fost adăugat cu succes!` });
      }
    } catch (e) {
      console.error('Add VIP manual error:', e);
      setActionNotice({ type: 'error', text: 'Eroare la adăugarea contactului VIP' });
    } finally {
      setVipActionLoading(false);
    }
  };

  const handleDeleteVip = async (id: string, name?: string) => {
    setVipActionLoading(true);
    try {
      const res = await fetch(`/api/contacts/vip/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        setVipContacts(data.contacts);
        setActionNotice({ type: 'info', text: `Contactul "${name || id}" a fost eliminat din lista VIP.` });
      }
    } catch (e) {
      console.error('Delete VIP error:', e);
    } finally {
      setVipActionLoading(false);
    }
  };

  const handleLogin = async () => {
    setLoginLoading(true);
    setLoginError(null);
    try {
      const result = await signInWithPopup(auth, googleAuthProvider);
      if (result.user) {
        const uData: AppUser = {
          uid: result.user.uid,
          email: result.user.email,
          displayName: result.user.displayName,
          photoURL: result.user.photoURL,
        };
        try {
          localStorage.setItem('alexia_active_user', JSON.stringify(uData));
        } catch (e) {}
        setUser(result.user);
      }
    } catch (e: any) {
      console.error('Login error:', e);
      const errCode = e?.code || '';
      let msg = 'Eroare la autentificare cu Google.';
      if (errCode.includes('popup-blocked')) {
        msg = 'Fereastra popup a fost blocată de browser. Poți folosi opțiunea "Intră Direct ca Alexandru" de mai jos!';
      } else if (errCode.includes('unauthorized-domain')) {
        msg = 'Domeniul nu este autorizat în Firebase Auth. Folosește butonul "Intră Direct ca Alexandru" pentru acces imediat!';
      } else if (e?.message) {
        msg = `Autentificare: ${e.message}`;
      }
      setLoginError(msg);
      setActionNotice({ type: 'error', text: msg });
    } finally {
      setLoginLoading(false);
    }
  };

  const handleDirectLogin = (name: string = 'Alexandru', email: string = 'savinalexandru2002@gmail.com') => {
    const adminUser: AppUser = {
      uid: 'alexandru_admin',
      email,
      displayName: name,
      photoURL: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=640&auto=format&fit=crop&q=85',
    };
    try {
      localStorage.setItem('alexia_active_user', JSON.stringify(adminUser));
    } catch (e) {}
    setUser(adminUser);
    setAuthLoading(false);
    setLoginError(null);
    setActionNotice({ type: 'success', text: `Bun venit înapoi, ${name}!` });
  };

  const handleLogout = async () => {
    try {
      localStorage.removeItem('alexia_active_user');
      setUser(null);
      await signOut(auth);
    } catch (e) {
      console.error('Logout error:', e);
    }
  };

  const handleSaveAISettings = async (updates: Partial<AISettings>) => {
    setSavingSettings(true);
    const newSettings = { ...aiSettings, ...updates };
    try {
      const res = await fetch('/api/ai/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings),
      });
      const data = await res.json();
      if (data.success && data.aiSettings) {
        setAiSettings(data.aiSettings);
        setActionNotice({ type: 'success', text: `Configurație salvată cu succes!` });
      }
    } catch (e) {
      setActionNotice({ type: 'error', text: 'Eroare la salvarea setărilor.' });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleRestartSession = async () => {
    setLoading(true);
    setActionNotice({ type: 'info', text: 'Se reinițializează conexiunea WhatsApp...' });
    try {
      const res = await fetch('/api/whatsapp/restart-session', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setActionNotice({ type: 'success', text: 'Sesiune reinițializată! Codul nou este gata de scanat.' });
        await fetchStatus();
      }
    } catch (e) {
      setActionNotice({ type: 'error', text: 'Eroare la reinițializarea sesiunii.' });
    } finally {
      setLoading(false);
    }
  };

  // Switch between QR code and Pairing code
  const handleSwitchMethod = async (targetMethod: 'qr' | 'pairing') => {
    setActiveMethod(targetMethod);
    setActionNotice(null);
    setPairingError(null);

    setLoading(true);
    try {
      const res = await fetch('/api/whatsapp/switch-method', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: targetMethod }),
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json();
        if (data.success) {
          if (targetMethod === 'qr') {
            setStatus(prev => ({
              ...prev,
              connectionMethod: 'qr',
              pairingCode: null,
              pairingPhone: null,
              qrCodeUrl: data.qrCodeUrl ?? prev.qrCodeUrl,
            }));
            setActionNotice({ type: 'info', text: 'Comutat la Scanare Cod QR. Scanează codul de pe ecran cu WhatsApp.' });
          } else {
            setStatus(prev => ({
              ...prev,
              connectionMethod: 'pairing',
            }));
          }
          await fetchStatus();
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Request 8-digit pairing code with phone number
  const handleRequestPairingCode = async (e?: React.FormEvent, overridePhone?: string) => {
    if (e) e.preventDefault();
    const targetPhone = (overridePhone ?? phoneNumberInput).trim();
    if (!targetPhone) {
      const msg = 'Te rugăm să introduci numărul de telefon (ex: 40712345678 sau 0712345678).';
      setPairingError(msg);
      setActionNotice({ type: 'error', text: msg });
      return;
    }

    setLoading(true);
    setPairingError(null);
    setActionNotice({ type: 'info', text: 'Se inițializează conexiunea securizată și se generează codul de asociere...' });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 32000);
    try {
      const res = await fetch('/api/whatsapp/request-pairing-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: targetPhone }),
        signal: controller.signal,
      });
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error('Serverul se reinițializează sau nu a răspuns cu JSON valid. Încearcă din nou în câteva secunde.');
      }
      const data = await res.json();
      if (res.ok && data.success && data.pairingCode) {
        const usedPhone = data.phone || targetPhone.replace(/[^0-9]/g, '');
        setPhoneNumberInput(usedPhone);
        setActiveMethod('pairing');
        setStatus(prev => ({
          ...prev,
          connectionMethod: 'pairing',
          pairingCode: data.pairingCode,
          pairingPhone: usedPhone,
        }));
        setActionNotice({
          type: 'success',
          text: `Cod generat pentru +${usedPhone}: ${data.pairingCode}! Introdu-l în WhatsApp pe telefon.`,
        });
        await fetchStatus();
      } else {
        const errText = data.error || 'Nu s-a putut genera codul de asociere.';
        setPairingError(errText);
        setActionNotice({ type: 'error', text: errText });
      }
    } catch (err: any) {
      const errText = err?.name === 'AbortError'
        ? 'Serverele WhatsApp au răspuns prea greu. Te rugăm să încerci din nou.'
        : (err?.message || 'Eroare de conexiune la generarea codului de asociere.');
      setPairingError(errText);
      setActionNotice({ type: 'error', text: errText });
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  };

  const handleClearPairingCode = async () => {
    setPairingError(null);
    setActionNotice(null);
    setStatus(prev => ({ ...prev, pairingCode: null, pairingPhone: null }));
    try {
      await fetch('/api/whatsapp/clear-pairing-code', { method: 'POST' });
    } catch {}
  };

  const copyPairingCodeToClipboard = () => {
    if (!status.pairingCode) return;
    navigator.clipboard.writeText(status.pairingCode.replace('-', ''));
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Process any uploaded image file (AVIF, WebP, PNG, JPEG) through HTML5 canvas
  // Center-crops to 1:1 and outputs clean 640x640 JPEG data URL, avoiding any Baileys / Jimp decoding errors
  const processImageFileToJpeg = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Eroare la citirea fișierului de pe dispozitiv.'));
      reader.onload = (e) => {
        const img = new window.Image();
        img.onerror = () => reject(new Error('Formatul imaginii nu a putut fi procesat. Te rugăm să încerci o altă imagine.'));
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = 640;
            canvas.height = 640;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              resolve(e.target?.result as string);
              return;
            }

            // Fill dark background for transparent PNGs
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(0, 0, 640, 640);

            // Center square crop
            const minDim = Math.min(img.width, img.height);
            const startX = Math.floor((img.width - minDim) / 2);
            const startY = Math.floor((img.height - minDim) / 2);

            ctx.drawImage(img, startX, startY, minDim, minDim, 0, 0, 640, 640);

            // Always export clean JPEG 640x640
            const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.88);
            resolve(jpegDataUrl);
          } catch (err) {
            resolve(e.target?.result as string);
          }
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const looksLikeImage =
      file.type.startsWith('image/') ||
      /\.(jpe?g|png|webp|avif|svg|gif|heic|heif|tiff?|bmp|ico|jfif)$/i.test(file.name);

    if (!looksLikeImage) {
      setActionNotice({
        type: 'error',
        text: 'Te rugăm să selectezi un fișier imagine (JPG, PNG, WebP, AVIF, SVG, GIF, HEIC, TIFF, BMP).',
      });
      return;
    }

    try {
      setActionNotice({ type: 'info', text: 'Se optimizează imaginea (orice format -> 640x640 JPEG standard WhatsApp)...' });
      let optimizedJpeg: string;
      try {
        optimizedJpeg = await processImageFileToJpeg(file);
      } catch {
        // Browser couldn't decode exotic format (e.g. HEIC / TIFF); convert via backend sharp
        const rawDataUrl = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onerror = () => reject(new Error('Nu s-a putut citi fișierul.'));
          r.onload = () => resolve(String(r.result || ''));
          r.readAsDataURL(file);
        });
        const convRes = await fetch('/api/images/convert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageData: rawDataUrl }),
        });
        const convData = await convRes.json();
        if (!convRes.ok || !convData.success || !convData.dataUrl) {
          throw new Error(convData.error || 'Formatul imaginii nu a putut fi convertit.');
        }
        optimizedJpeg = convData.dataUrl;
      }

      setCurrentAvatarUrl(optimizedJpeg);
      setActionNotice({
        type: 'success',
        text: 'Poză optimizată cu succes (640x640 JPEG)! Apasă pe "Aplică pe WhatsApp Acum" pentru a o trimite pe profilul tău.',
      });
    } catch (err: any) {
      setActionNotice({ type: 'error', text: `Eroare: ${err.message || 'Nu s-a putut procesa imaginea.'}` });
    }
  };

  const handleUpdateWhatsAppAvatar = async () => {
    setUpdatingAvatar(true);
    setActionNotice({ type: 'info', text: 'Se procesează formatul și se transmite poza pe profilul tău WhatsApp...' });
    try {
      const res = await fetch('/api/whatsapp/update-avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarUrl: currentAvatarUrl }),
      });
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error('Răspuns invalid de la server.');
      }
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.rateLimited || data.pendingSync) {
          setActionNotice({
            type: 'info',
            text: `🛡️ ${data.message || 'Poza a fost salvată în profil! WhatsApp solicită o scurtă pauză de siguranță.'}`,
          });
        } else {
          // Photo successfully appeared on WhatsApp profile! Track progress in the current 5-image batch.
          const isInCurrentRow = searchResults.includes(currentAvatarUrl);
          const nextApplied = isInCurrentRow && !appliedInBatch.includes(currentAvatarUrl)
            ? [...appliedInBatch, currentAvatarUrl]
            : appliedInBatch;
          setAppliedInBatch(nextApplied);

          if (data.nextBatchDownloaded && Array.isArray(data.batchImages) && data.batchImages.length > 0) {
            const new5 = data.batchImages.slice(0, 5);
            setSearchResults(new5);
            setAppliedInBatch([]);
            setGalleryPageOffset(prev => (data.batchNumber ? Math.max(0, data.batchNumber - 1) : prev + 1));
            setSeenGalleryUrls(prev => [...prev, ...new5].slice(-150));
            setActionNotice({
              type: 'success',
              text: `✅ ${data.message}`,
            });
          } else if (autoNextBatchAfter5 && isInCurrentRow && nextApplied.length >= Math.min(5, searchResults.length)) {
            setActionNotice({
              type: 'success',
              text: `✅ Toate cele 5 poze din lot au apărut pe profilul WhatsApp! Se descarcă automat următoarele 5 poze noi...`,
            });
            await loadPinterestGallery(activeThemeQuery, true);
          } else {
            setActionNotice({
              type: 'success',
              text: isInCurrentRow
                ? `✅ Poza a apărut pe profilul WhatsApp (${nextApplied.length}/5 din lotul curent aplicate)!`
                : '✅ Imaginea de profil a fost actualizată cu succes pe contul tău WhatsApp!',
            });
          }
        }
        await fetchStatus();
      } else {
        setActionNotice({ type: 'error', text: `❌ ${data.error || 'Nu s-a putut actualiza imaginea de profil.'}` });
      }
    } catch (e: any) {
      setActionNotice({ type: 'error', text: `❌ ${e?.message || 'Eroare la comunicarea cu serverul.'}` });
    } finally {
      setUpdatingAvatar(false);
    }
  };

  const handleTriggerAutoAvatar = async () => {
    setUpdatingAvatar(true);
    setActionNotice({ type: 'info', text: 'Se aplică următoarea poză din lotul tematic pe WhatsApp...' });
    try {
      const res = await fetch('/api/whatsapp/trigger-auto-avatar', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        if (data.url) setCurrentAvatarUrl(data.url);
        if (data.rateLimited || data.pendingSync) {
          setActionNotice({ type: 'info', text: `🛡️ ${data.message}` });
        } else {
          if (data.nextBatchDownloaded && Array.isArray(data.batchImages) && data.batchImages.length > 0) {
            const new5 = data.batchImages.slice(0, 5);
            setSearchResults(new5);
            setAppliedInBatch([]);
            setGalleryPageOffset(prev => (data.batchNumber ? Math.max(0, data.batchNumber - 1) : prev + 1));
            setSeenGalleryUrls(prev => [...prev, ...new5].slice(-150));
          } else if (data.url && searchResults.includes(data.url)) {
            setAppliedInBatch(prev => (prev.includes(data.url) ? prev : [...prev, data.url]));
          }
          setActionNotice({ type: 'success', text: `✅ ${data.message || 'Imaginea a fost schimbată cu succes conform temei tale!'}` });
        }
        await fetchStatus();
      } else {
        setActionNotice({ type: 'error', text: data.error || 'Eroare la schimbarea imaginii.' });
      }
    } catch (e) {
      setActionNotice({ type: 'error', text: 'Eroare de conexiune.' });
    } finally {
      setUpdatingAvatar(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white space-y-4">
        <div className="w-16 h-16 bg-emerald-600 rounded-2xl flex items-center justify-center animate-bounce shadow-lg shadow-emerald-600/20">
          <MessageCircle className="w-8 h-8" />
        </div>
        <div className="text-sm font-medium text-slate-400 animate-pulse">Se încarcă securitatea...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-slate-950">
        <div className="max-w-md w-full space-y-6 bg-slate-900/60 p-8 sm:p-10 rounded-3xl border border-slate-800 backdrop-blur-xl shadow-2xl text-center">
          <div className="space-y-3">
            <div className="w-20 h-20 bg-emerald-600 rounded-3xl mx-auto flex items-center justify-center shadow-2xl shadow-emerald-600/30">
              <Lock className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight">WhatsOmni AI</h1>
            <p className="text-slate-400 text-xs leading-relaxed">
              Asistentul tău WhatsApp 24/7 cu inteligență artificială avansată, contacte VIP și stocare securizată Cloud SQL.
            </p>
          </div>

          {loginError && (
            <div className="p-3.5 bg-red-950/80 border border-red-800/80 rounded-2xl text-xs text-red-200 text-left space-y-1 animate-fadeIn">
              <div className="font-bold flex items-center gap-1.5 text-red-400">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>Notificare Autentificare:</span>
              </div>
              <p className="text-[11px] leading-relaxed opacity-90">{loginError}</p>
            </div>
          )}

          <div className="py-2 space-y-3">
            <div className="flex items-center gap-3 p-3 bg-slate-950/60 rounded-2xl border border-slate-800/80 text-left">
              <div className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center shrink-0">
                <Database className="w-4 h-4" />
              </div>
              <div className="text-xs">
                <div className="font-bold text-white">Cloud SQL Permanent</div>
                <div className="text-slate-500 text-[11px]">Mesaje și contacte VIP salvate 24/7.</div>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-slate-950/60 rounded-2xl border border-slate-800/80 text-left">
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                <Crown className="w-4 h-4 fill-amber-400" />
              </div>
              <div className="text-xs">
                <div className="font-bold text-white">Contacte VIP &amp; Răspunsuri @Alexandru</div>
                <div className="text-slate-500 text-[11px]">Evidențiere specială pentru persoanele prioritare.</div>
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <button
              onClick={handleLogin}
              disabled={loginLoading}
              className="w-full py-3.5 bg-white hover:bg-slate-100 disabled:opacity-60 text-slate-950 font-bold rounded-2xl transition-all flex items-center justify-center gap-3 shadow-xl hover:scale-[1.01] active:scale-95 cursor-pointer text-sm"
            >
              {loginLoading ? <RefreshCw className="w-4 h-4 animate-spin text-slate-950" /> : <LogIn className="w-4 h-4" />}
              <span>Conectare cu Google</span>
            </button>

            {/* Direct Admin Login Button: Solves iframe popup blocking permanently */}
            <button
              onClick={() => handleDirectLogin('Alexandru', 'savinalexandru2002@gmail.com')}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl transition-all flex items-center justify-center gap-2.5 shadow-lg shadow-emerald-600/20 hover:scale-[1.01] active:scale-95 cursor-pointer text-sm border border-emerald-400/30"
            >
              <Crown className="w-4 h-4 text-amber-300 fill-amber-300" />
              <span>Intră Direct ca Alexandru (Admin)</span>
            </button>

            <p className="text-[11px] text-slate-400 pt-1">
              Dacă fereastra Google nu se deschide sau se blochează, apasă direct pe <strong>"Intră Direct ca Alexandru"</strong>.
            </p>
          </div>

          <p className="text-[10px] text-slate-500 pt-2 uppercase tracking-widest font-bold">
            Securizat de Firebase &amp; Cloud SQL
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500 selection:text-white pb-16">
      
      {/* HEADER */}
      <header className="sticky top-0 z-50 flex items-center justify-between gap-6 px-6 lg:px-12 py-4 bg-slate-900/90 backdrop-blur-md border-b border-slate-800">
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-lg shadow-emerald-600/30">
            <MessageCircle className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold tracking-tight text-white whitespace-nowrap">
                Alexia
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <Cloud className="w-3 h-3" />
                <span>Cloud 24/7 Permanent</span>
              </span>
            </div>
            <div className="text-xs text-slate-400 font-medium">
              WhatsApp Messenger &amp; WhatsApp Business
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="hidden md:flex items-center gap-2 text-sm font-medium">
          <button 
            onClick={() => setActiveTab('connect')}
            className={`px-4 py-2 rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-2 cursor-pointer ${activeTab === 'connect' ? 'bg-slate-800 text-white font-semibold border border-slate-700' : 'text-slate-400 hover:text-white'}`}
          >
            <QrCode className="w-4 h-4" />
            <span>Conectare WhatsApp</span>
            {status.isConnected && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>}
          </button>
          <button 
            onClick={() => setActiveTab('avatar')}
            className={`px-4 py-2 rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-2 cursor-pointer ${activeTab === 'avatar' ? 'bg-slate-800 text-white font-semibold border border-slate-700' : 'text-slate-400 hover:text-white'}`}
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>Poza de Profil</span>
          </button>
          <button 
            onClick={() => setActiveTab('ai')}
            className={`px-4 py-2 rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-2 cursor-pointer ${activeTab === 'ai' ? 'bg-slate-800 text-white font-semibold border border-slate-700' : 'text-slate-400 hover:text-white'}`}
          >
            <Brain className="w-4 h-4 text-purple-400" />
            <span>Toți AI &amp; Jurnal WhatsApp</span>
          </button>
          <button 
            onClick={() => setActiveTab('cd')}
            className={`px-4 py-2 rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-2 cursor-pointer ${
              activeTab === 'cd' 
                ? 'bg-slate-800 text-emerald-400 font-semibold border border-emerald-500/40 shadow-lg shadow-emerald-500/10' 
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Terminal className="w-4 h-4 text-emerald-400" />
            <span>Terminal PC <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">cd</span></span>
          </button>
          <button
            onClick={() => setActiveTab('zrok')}
            className={`px-4 py-2 rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-2 cursor-pointer ${
              activeTab === 'zrok'
                ? 'bg-slate-800 text-cyan-300 font-semibold border border-cyan-500/40 shadow-lg shadow-cyan-500/10'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Globe className="w-4 h-4 text-cyan-400" />
            <span>Tunel Zrok</span>
            {zrokStatus?.isRunning && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>}
          </button>
        </nav>

        {/* User profile and Database Status */}
        <div className="flex items-center gap-4 shrink-0">
          {/* DB Stats Badge */}
          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 rounded-full border border-slate-700 text-[10px] font-bold">
            <Database className={`w-3 h-3 ${cloudSqlStats?.success ? 'text-emerald-400' : 'text-slate-500'}`} />
            <span className="text-slate-400">Cloud SQL:</span>
            <span className={cloudSqlStats?.success ? 'text-emerald-400' : 'text-amber-400'}>
              {cloudSqlStats?.success ? '24/7 Online' : 'Connecting...'}
            </span>
          </div>

          <div className="flex items-center gap-3 pl-4 border-l border-slate-800">
            <div className="hidden sm:block text-right">
              <div className="text-[11px] font-bold text-white leading-none">{user.displayName || 'Alexandru'}</div>
              <div className="text-[9px] text-slate-500 mt-0.5">{user.email || 'savinalexandru2002@gmail.com'}</div>
            </div>
            {user.photoURL ? (
              <img src={user.photoURL} alt="" className="w-8 h-8 rounded-full border border-slate-700 object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-xs border border-slate-700">
                {(user.displayName || 'A').charAt(0).toUpperCase()}
              </div>
            )}
            <button 
              onClick={handleLogout}
              className="p-2 text-slate-500 hover:text-red-400 transition-colors cursor-pointer"
              title="Deconectare"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* MOBILE NAV */}
      <div className="flex md:hidden overflow-x-auto px-4 py-2 bg-slate-900 border-b border-slate-800 gap-2 shrink-0">
        <button onClick={() => setActiveTab('connect')} className={`px-3 py-1.5 text-xs rounded-md whitespace-nowrap ${activeTab === 'connect' ? 'bg-slate-800 text-white font-semibold' : 'text-slate-400'}`}>Conectare</button>
        <button onClick={() => setActiveTab('avatar')} className={`px-3 py-1.5 text-xs rounded-md whitespace-nowrap ${activeTab === 'avatar' ? 'bg-slate-800 text-white font-semibold' : 'text-slate-400'}`}>Poza Profil</button>
        <button onClick={() => setActiveTab('ai')} className={`px-3 py-1.5 text-xs rounded-md whitespace-nowrap ${activeTab === 'ai' ? 'bg-slate-800 text-white font-semibold' : 'text-slate-400'}`}>Toți AI &amp; Jurnal</button>
        <button onClick={() => setActiveTab('cd')} className={`px-3 py-1.5 text-xs rounded-md whitespace-nowrap ${activeTab === 'cd' ? 'bg-slate-800 text-emerald-400 font-semibold' : 'text-slate-400'}`}>Terminal PC cd</button>
        <button onClick={() => setActiveTab('zrok')} className={`px-3 py-1.5 text-xs rounded-md whitespace-nowrap flex items-center gap-1.5 ${activeTab === 'zrok' ? 'bg-slate-800 text-cyan-300 font-semibold' : 'text-slate-400'}`}>
          <span>Tunel Zrok</span>
          {zrokStatus?.isRunning && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>}
        </button>
      </div>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">

        {/* NOTICES */}
        {actionNotice && (
          <div className={`p-4 rounded-xl flex items-center justify-between text-xs border ${
            actionNotice.type === 'success' ? 'bg-emerald-950/70 border-emerald-800 text-emerald-200' :
            actionNotice.type === 'error' ? 'bg-red-950/70 border-red-800 text-red-200' :
            'bg-slate-900 border-slate-700 text-slate-300'
          }`}>
            <div className="flex items-center gap-2">
              <CheckCircle2 className={`w-4 h-4 shrink-0 ${actionNotice.type === 'success' ? 'text-emerald-400' : actionNotice.type === 'error' ? 'text-red-400' : 'text-cyan-400'}`} />
              <span>{actionNotice.text}</span>
            </div>
            <button onClick={() => setActionNotice(null)} className="font-bold hover:underline ml-4 cursor-pointer">Închide</button>
          </div>
        )}

        {/* CLOUD 24/7 & @Alexandru BANNER */}
        <div className="p-4 bg-slate-900/90 rounded-2xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600/20 text-purple-400 flex items-center justify-center shrink-0 border border-purple-500/30">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-white flex items-center gap-2">
                <span>Răspunsuri Automate pe WhatsApp:</span>
                <span className="px-2 py-0.5 rounded bg-purple-500/30 text-purple-300 font-mono text-[11px] font-bold border border-purple-500/40">
                  @Alexandru
                </span>
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-bold border border-emerald-500/30 flex items-center gap-1">
                  <Cpu className="w-3 h-3" />
                  <span>Toți AI Activi</span>
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                După scanare, conexiunea <strong>rămâne permanent activă pe Cloud 24/7</strong>. Asistentul răspunde automat exclusiv la mesajele WhatsApp care conțin mențiunea @Alexandru.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] text-slate-400">Arhitectură:</span>
            <span className="px-2.5 py-1 bg-slate-800 text-emerald-400 text-[10px] rounded-lg font-semibold border border-slate-700">Google Cloud Run</span>
            <span className="px-2.5 py-1 bg-slate-800 text-purple-400 text-[10px] rounded-lg font-semibold border border-slate-700">Multi-AI Ensemble</span>
          </div>
        </div>

        {/* ==================== TAB 1: CONNECTION (QR & PAIRING SWITCHER) ==================== */}
        {activeTab === 'connect' && (
          <div className="space-y-6">
            {!status.isConnected ? (
              <div className="space-y-6">
                
                {/* RECONNECTING NOTICE IF ALREADY REGISTERED */}
                {/* (Notice logic kept for context but buttons moved to main control panel below) */}
                {status.isRegistered && (
                  <div className="p-4 bg-cyan-950/60 border border-cyan-800/80 rounded-2xl flex items-center gap-3 text-cyan-200 text-xs">
                    <RefreshCw className="w-5 h-5 animate-spin text-cyan-400 shrink-0" />
                    <div className="flex-1">
                      <strong className="block font-bold">Sesiune WhatsApp salvată pe Cloud!</strong>
                      <span className="opacity-80">Dispozitivul tău (+{status.userPhone}) este deja înregistrat. Folosește panoul de control de mai jos pentru a forța conectarea dacă nu se întâmplă automat.</span>
                    </div>
                  </div>
                )}

                {/* PANOU CONTROL CLOUD 24/7 - requested by user for easy access */}
                <div className="bg-slate-900/80 p-6 rounded-2xl border-2 border-emerald-500/30 shadow-2xl space-y-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-emerald-600 flex items-center justify-center text-white shadow-lg shadow-emerald-600/30">
                        <RefreshCw className={`w-6 h-6 ${loading ? 'animate-spin' : ''}`} />
                      </div>
                      <div>
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                          Panou Control Cloud 24/7
                          {status.isConnected ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] animate-pulse uppercase tracking-wider">Online</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] uppercase tracking-wider">În așteptare</span>
                          )}
                        </h2>
                        <p className="text-xs text-slate-400">Găsește sesiunea în cloud și te conectează automat.</p>
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-3">
                      <button 
                        onClick={async () => {
                          setLoading(true);
                          setActionNotice({ type: 'info', text: 'Se caută sesiunea în Cloud SQL...' });
                          await fetch('/api/whatsapp/reconnect', { method: 'POST' });
                          setTimeout(fetchStatus, 2000);
                          setLoading(false);
                        }}
                        className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg transition-all flex items-center gap-2 cursor-pointer active:scale-95"
                      >
                        <RefreshCw className="w-4 h-4" />
                        <span>RECONECTEAZĂ MANUAL ACUM</span>
                      </button>

                      <button 
                        onClick={handleRestartSession}
                        className="px-4 py-3 bg-slate-800 hover:bg-red-900/30 hover:text-red-400 border border-slate-700 hover:border-red-800 text-slate-300 font-semibold rounded-xl transition-all flex items-center gap-2 cursor-pointer"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>ȘTERGE ȘI RESETEAZĂ TOTUL</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* METHOD SWITCHER: "Când nu mai merge, comuți între ele" */}
                <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg">
                  <div>
                    <div className="flex items-center gap-2">
                      <ArrowLeftRight className="w-4 h-4 text-emerald-400" />
                      <span className="text-sm font-bold text-white">Comută Metoda de Conectare</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Dacă una dintre metode expiră sau camera nu o recunoaște, <strong>comuți instant între ele</strong>:
                    </p>
                  </div>

                  <div className="flex items-center bg-slate-950 p-1.5 rounded-xl border border-slate-800 gap-1 shrink-0">
                    <button
                      onClick={() => handleSwitchMethod('qr')}
                      className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                        activeMethod === 'qr' 
                          ? 'bg-slate-800 text-white shadow-md font-bold' 
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <QrCode className="w-4 h-4" />
                      <span>1. Scanare Cod QR</span>
                    </button>
                    <button
                      onClick={() => handleSwitchMethod('pairing')}
                      className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                        activeMethod === 'pairing' 
                          ? 'bg-slate-800 text-white shadow-md font-bold' 
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <KeyRound className="w-4 h-4" />
                      <span>2. Cod de Asociere (8 Caractere)</span>
                    </button>
                  </div>
                </div>

                {/* METHOD 1: QR CODE */}
                {activeMethod === 'qr' && (
                  <div className="bg-slate-900 rounded-2xl p-8 border border-slate-800 shadow-xl grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
                    
                    {/* QR Code Container */}
                    <div className="flex flex-col items-center justify-center p-6 bg-slate-950 rounded-2xl border border-slate-800/80 space-y-4">
                      <div className="flex items-center justify-between w-full px-2">
                        <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                          Cod QR WhatsApp Web Oficial
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">Multi-Device Cloud</span>
                      </div>
                      
                      {status.qrCodeUrl ? (
                        <div className="bg-white p-3.5 rounded-2xl shadow-2xl border-4 border-emerald-500/40 relative group">
                          <img 
                            src={status.qrCodeUrl} 
                            alt="WhatsApp Web QR Code" 
                            className="w-72 h-72 object-contain rounded-lg" 
                          />
                        </div>
                      ) : (
                        <div className="w-72 h-72 bg-slate-900 rounded-2xl flex flex-col items-center justify-center text-slate-400 text-xs p-6 text-center space-y-3 border border-slate-800">
                          <RefreshCw className="w-8 h-8 animate-spin text-emerald-500" />
                          <span>Se stabilește conexiunea la serverele WhatsApp Web...</span>
                        </div>
                      )}

                      <p className="text-[11px] text-slate-400 text-center max-w-xs leading-relaxed">
                        Scanează o singură dată cu camera WhatsApp. Sesiunea se va salva automat și va rămâne conectată 24/7.
                      </p>

                      <div className="flex items-center gap-2 w-full pt-2">
                        <button 
                          onClick={handleRestartSession}
                          disabled={loading}
                          className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer border border-slate-700"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                          <span>Generează Cod QR Nou</span>
                        </button>

                        <button
                          onClick={() => handleSwitchMethod('pairing')}
                          className="py-2.5 px-3 bg-purple-950/40 hover:bg-purple-900/50 text-purple-300 border border-purple-800/50 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                          title="Comută la cod de asociere dacă QR nu merge"
                        >
                          <ArrowLeftRight className="w-3.5 h-3.5 text-purple-400" />
                          <span>Nu merge QR-ul?</span>
                        </button>
                      </div>
                    </div>

                    {/* Step by step scan guide */}
                    <div className="space-y-6">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                        <div>
                          <h3 className="text-xl font-bold text-white">Instrucțiuni Scanare:</h3>
                          <p className="text-xs text-slate-400 mt-0.5">Selectează aplicația pe care o folosești pe telefon:</p>
                        </div>
                        
                        {/* Sub-selector Messenger vs Business */}
                        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                          <button
                            onClick={() => setAppTypeGuide('messenger')}
                            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                              appTypeGuide === 'messenger' ? 'bg-slate-800 text-emerald-400' : 'text-slate-400'
                            }`}
                          >
                            WhatsApp Normal
                          </button>
                          <button
                            onClick={() => setAppTypeGuide('business')}
                            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                              appTypeGuide === 'business' ? 'bg-slate-800 text-emerald-400' : 'text-slate-400'
                            }`}
                          >
                            WhatsApp Business
                          </button>
                        </div>
                      </div>

                      {appTypeGuide === 'messenger' ? (
                        <div className="space-y-3">
                          <div className="flex items-start gap-3 p-4 bg-slate-950/60 rounded-xl border border-slate-800">
                            <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 font-bold text-xs flex items-center justify-center shrink-0">1</div>
                            <div className="text-xs">
                              <strong className="text-white block">Deschide WhatsApp Messenger</strong>
                              <span className="text-slate-400">Pe telefonul tău mobil (Android sau iPhone).</span>
                            </div>
                          </div>

                          <div className="flex items-start gap-3 p-4 bg-slate-950/60 rounded-xl border border-slate-800">
                            <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 font-bold text-xs flex items-center justify-center shrink-0">2</div>
                            <div className="text-xs">
                              <strong className="text-white block">Accesează "Dispozitive conectate"</strong>
                              <span className="text-slate-400">Pe Android: apasă pe cele 3 puncte verticale &rarr; <strong>Dispozitive conectate</strong>. Pe iPhone: <strong>Setări &rarr; Dispozitive conectate</strong>.</span>
                            </div>
                          </div>

                          <div className="flex items-start gap-3 p-4 bg-slate-950/60 rounded-xl border border-slate-800">
                            <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 font-bold text-xs flex items-center justify-center shrink-0">3</div>
                            <div className="text-xs">
                              <strong className="text-white block">Apasă pe "Conectează un dispozitiv"</strong>
                              <span className="text-slate-400">Îndreaptă camera spre codul QR din stânga. Dispozitivul va fi asociat și salvat permanent!</span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex items-start gap-3 p-4 bg-slate-950/60 rounded-xl border border-slate-800">
                            <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 font-bold text-xs flex items-center justify-center shrink-0">1</div>
                            <div className="text-xs">
                              <strong className="text-white block">Deschide WhatsApp Business</strong>
                              <span className="text-slate-400">Pe telefonul tău mobil unde ai contul Business activ.</span>
                            </div>
                          </div>

                          <div className="flex items-start gap-3 p-4 bg-slate-950/60 rounded-xl border border-slate-800">
                            <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 font-bold text-xs flex items-center justify-center shrink-0">2</div>
                            <div className="text-xs">
                              <strong className="text-white block">Accesează "Dispozitive conectate"</strong>
                              <span className="text-slate-400">Apasă pe Meniu (Android) sau Setări (iPhone) &rarr; <strong>Dispozitive conectate</strong>.</span>
                            </div>
                          </div>

                          <div className="flex items-start gap-3 p-4 bg-slate-950/60 rounded-xl border border-slate-800">
                            <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 font-bold text-xs flex items-center justify-center shrink-0">3</div>
                            <div className="text-xs">
                              <strong className="text-white block">Scanează codul QR</strong>
                              <span className="text-slate-400">Asistentul preia automat mesajele primite de clienții tăi menționați cu @Alexandru!</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                  </div>
                )}

                {/* METHOD 2: 8-DIGIT PAIRING CODE */}
                {activeMethod === 'pairing' && (
                  <div className="bg-slate-900 rounded-2xl p-8 border border-slate-800 shadow-xl grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
                    
                    <div className="flex flex-col p-6 bg-slate-950 rounded-2xl border border-slate-800 space-y-5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                          <KeyRound className="w-4 h-4" />
                          <span>Cod de Asociere 8 Caractere</span>
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">Fără Cameră / QR</span>
                      </div>

                      {status.pairingCode ? (
                        <div className="bg-slate-900 p-6 rounded-2xl border-2 border-emerald-500/40 text-center space-y-4 shadow-2xl">
                          <div className="space-y-1">
                            <span className="text-[11px] text-slate-400 font-medium block">
                              Codul tău de asociere WhatsApp{(status.pairingPhone || phoneNumberInput) ? ` pentru +${(status.pairingPhone || phoneNumberInput).replace(/[^0-9]/g, '')}` : ''}:
                            </span>
                          </div>
                          <div className="font-mono text-3xl sm:text-4xl font-extrabold text-emerald-400 tracking-widest py-3 bg-slate-950 rounded-xl border border-slate-800 select-all">
                            {status.pairingCode}
                          </div>

                          <div className="flex flex-wrap items-center justify-center gap-2">
                            <button
                              type="button"
                              onClick={copyPairingCodeToClipboard}
                              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-2 cursor-pointer transition-colors"
                            >
                              {copiedCode ? <CheckCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                              <span>{copiedCode ? 'Copiat!' : 'Copiază Codul'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleRequestPairingCode(undefined, status.pairingPhone || phoneNumberInput)}
                              disabled={loading}
                              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer border border-slate-700 transition-colors"
                            >
                              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                              <span>Cod Nou</span>
                            </button>

                            <button
                              type="button"
                              onClick={handleClearPairingCode}
                              disabled={loading}
                              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 rounded-lg text-xs font-semibold cursor-pointer border border-slate-700 transition-colors"
                            >
                              <span>Schimbă Numărul</span>
                            </button>
                          </div>

                          <p className="text-[11px] text-slate-400 leading-relaxed">
                            Pe telefon vei primi o notificare WhatsApp pentru asociere — deschide-o și tastează acest cod de 8 caractere!
                          </p>
                        </div>
                      ) : (
                        <form onSubmit={(e) => handleRequestPairingCode(e)} className="space-y-4">
                          <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-300">
                              Introdu numărul tău de WhatsApp:
                            </label>
                            <input
                              type="tel"
                              value={phoneNumberInput}
                              onChange={(e) => {
                                setPhoneNumberInput(e.target.value);
                                if (pairingError) setPairingError(null);
                              }}
                              placeholder="ex: 0712345678 sau +40712345678"
                              className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-sm font-mono text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                            <p className="text-[10px] text-slate-400">
                              * Acceptă format local România (ex: 0712345678) sau internațional cu prefix de țară (ex: 40712345678 / +40712345678).
                            </p>
                          </div>

                          {pairingError && (
                            <div className="p-3 bg-red-950/60 border border-red-800/70 rounded-xl text-xs text-red-300">
                              {pairingError}
                            </div>
                          )}

                          <button
                            type="submit"
                            disabled={loading || !phoneNumberInput.trim()}
                            className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
                          >
                            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                            <span>{loading ? 'Se conectează la WhatsApp și se generează codul...' : 'Generează Codul de Asociere (8 caractere)'}</span>
                          </button>
                        </form>
                      )}

                      <div className="pt-2 border-t border-slate-800 flex justify-between items-center">
                        <button
                          type="button"
                          onClick={() => handleSwitchMethod('qr')}
                          className="text-xs font-semibold text-emerald-400 hover:underline flex items-center gap-1.5 cursor-pointer"
                        >
                          <ArrowLeftRight className="w-3.5 h-3.5" />
                          <span>Comută înapoi la Scanare Cod QR</span>
                        </button>
                      </div>
                    </div>

                    {/* Step by step Pairing code guide */}
                    <div className="space-y-5">
                      <div>
                        <h3 className="text-xl font-bold text-white">Cum introduci codul pe telefon:</h3>
                        <p className="text-xs text-slate-400 mt-1">
                          Aceasta este funcția oficială WhatsApp de asociere fără cameră:
                        </p>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-start gap-3 p-4 bg-slate-950/60 rounded-xl border border-slate-800">
                          <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 font-bold text-xs flex items-center justify-center shrink-0">1</div>
                          <div className="text-xs">
                            <strong className="text-white block">Deschide WhatsApp / WhatsApp Business</strong>
                            <span className="text-slate-400">Mergi la <strong>Meniu / Setări &rarr; Dispozitive conectate</strong>.</span>
                          </div>
                        </div>

                        <div className="flex items-start gap-3 p-4 bg-slate-950/60 rounded-xl border border-slate-800">
                          <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 font-bold text-xs flex items-center justify-center shrink-0">2</div>
                          <div className="text-xs">
                            <strong className="text-white block">Apasă pe "Conectează un dispozitiv"</strong>
                            <span className="text-slate-400">Pe ecranul camerei, apasă jos pe textul <strong>"Asociază folosind numărul de telefon"</strong> ("Link with phone number instead").</span>
                          </div>
                        </div>

                        <div className="flex items-start gap-3 p-4 bg-slate-950/60 rounded-xl border border-slate-800">
                          <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 font-bold text-xs flex items-center justify-center shrink-0">3</div>
                          <div className="text-xs">
                            <strong className="text-white block">Tastează codul de 8 caractere</strong>
                            <span className="text-slate-400">Tastează codul generat pe ecran. Conexiunea se finalizează și rămâne salvată 24/7!</span>
                          </div>
                        </div>
                      </div>
                    </div>

                  </div>
                )}

              </div>
            ) : (
              /* CONNECTED STATE */
              <div className="bg-slate-900 rounded-2xl p-8 border border-emerald-500/30 shadow-2xl space-y-6">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-6 pb-6 border-b border-slate-800">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-600/30">
                      <Smartphone className="w-8 h-8" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-xl font-bold text-white">WhatsApp Conectat Permanent 24/7</h2>
                        <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></span>
                      </div>
                      <p className="text-xs text-emerald-400 font-mono mt-0.5">Număr asociat: +{status.userPhone}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">Sesiunea este salvată permanent pe Cloud. Nu mai trebuie să scanezi codul QR.</p>
                    </div>
                  </div>

                  {/* Troubleshooting Alert for Corrupted Sessions (Bad MAC) */}
                  {(status.logs.some(l => l.text.toLowerCase().includes('bad mac') || l.text.toLowerCase().includes('decryption')) || !status.isConnected) && (
                    <div className="p-4 bg-amber-950/30 border border-amber-500/30 rounded-xl flex items-start gap-3">
                      <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                      <div className="text-[11px] space-y-1">
                        <p className="font-bold text-amber-400">Problemă de Securitate Detectată (Bad MAC / Sesiune Coruptă)?</p>
                        <p className="text-slate-400 leading-relaxed">
                          Dacă primești erori de criptare sau "Bad MAC", te rugăm să folosești butonul <strong>"Șterge & Reset Sesiune"</strong> de mai jos. Acesta va curăța cheile corupte și îți va permite să te reconectezi curat.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <button 
                      onClick={() => {
                        setLoading(true);
                        fetch('/api/whatsapp/reconnect', { method: 'POST' })
                          .then(() => fetchStatus())
                          .finally(() => setLoading(false));
                      }}
                      disabled={loading}
                      className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer transition-colors"
                    >
                      <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                      <span>Reconectează Manual</span>
                    </button>

                    <button 
                      onClick={handleRestartSession}
                      className="px-4 py-2.5 bg-red-950/50 hover:bg-red-900/60 text-red-300 border border-red-800/60 rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Șterge &amp; Reset Sesiune</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-5 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-white">
                      <Cpu className="w-4 h-4 text-purple-400" />
                      <span>Răspunsuri Automate cu Toți AI</span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Când cineva trimite pe WhatsApp un mesaj care conține <strong>@Alexandru</strong>, asistentul folosește ansamblul Multi-AI (Gemini 3.8 Flash, 3.1 Flash Lite) pentru a formula răspunsul cel mai inteligent și îl trimite direct în conversație.
                    </p>
                  </div>

                  <div className="p-5 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-white">
                      <Image className="w-4 h-4 text-emerald-400" />
                      <span>Schimbă Poza de Profil pe WhatsApp</span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Poți schimba poza contului tău WhatsApp oricând din tabul <strong>"Poza de Profil"</strong>.
                    </p>
                    <button 
                      onClick={() => setActiveTab('avatar')}
                      className="text-xs font-semibold text-emerald-400 hover:underline pt-1 block cursor-pointer"
                    >
                      Mergi la Poza de Profil &rarr;
                    </button>
                  </div>
                </div>

              </div>
            )}

            {/* PERMANENT CLOUD CONTROL PANEL - ALWAYS VISIBLE AT BOTTOM OF CONNECT TAB */}
            <div className="bg-slate-900 rounded-2xl p-6 border-t-4 border-t-emerald-500/50 border border-slate-800 shadow-xl space-y-4">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Cloud className="w-5 h-5 text-emerald-400" />
                    <h3 className="text-lg font-bold text-white uppercase tracking-tight">Panou Control Cloud 24/7</h3>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Gestionează manual conexiunea asistentului tău WhatsApp salvată în Cloud SQL.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button 
                    onClick={() => {
                      setLoading(true);
                      fetch('/api/whatsapp/reconnect', { method: 'POST' })
                        .then(() => {
                          setActionNotice({ type: 'info', text: 'Cerere de reconectare trimisă în Cloud...' });
                          fetchStatus();
                        })
                        .finally(() => setLoading(false));
                    }}
                    disabled={loading}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/20 cursor-pointer transition-all active:scale-95"
                  >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    <span>RECONECTEAZĂ MANUAL ACUM</span>
                  </button>

                  <button 
                    onClick={handleRestartSession}
                    className="px-5 py-2.5 bg-red-950/50 hover:bg-red-900/60 text-red-300 border border-red-800/60 font-bold rounded-xl text-xs flex items-center gap-2 cursor-pointer transition-all active:scale-95"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>ȘTERGE ȘI RESETEAZĂ TOTUL</span>
                  </button>
                </div>
              </div>

              {status.isRegistered && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-950 rounded-lg border border-slate-800 w-fit">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                  <span className="text-[10px] font-bold text-slate-500 tracking-wider">
                    SESIUNE ACTIVĂ ÎN CLOUD PENTRU: <span className="text-emerald-400">+{status.userPhone}</span>
                  </span>
                </div>
              )}
            </div>

          </div>
        )}

        {/* ==================== TAB 2: PROFILE PICTURE CHANGER (REBUILT & BULLETPROOF) ==================== */}
        {activeTab === 'avatar' && (
          <div className="bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-800 shadow-2xl space-y-8">
            
            {/* Header & Shields Banner */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-slate-800">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2.5">
                    <Sparkles className="w-6 h-6 text-amber-400" />
                    <span>Manager Poză de Profil WhatsApp</span>
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/30">
                    PINTEREST 5-IMAGE LOT
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    CANVAS JPEG 640x640
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-400 max-w-2xl">
                  Setează instant orice poză pe profilul tău de WhatsApp, alege dintr-un lot de 5 imagini tematice de pe Pinterest sau încarcă direct din telefon/calculator în format 100% optimizat fără erori de decodare.
                </p>
              </div>

              {/* Status & Cooldown Safety Badge */}
              <div className="flex flex-wrap items-center gap-3 shrink-0">
                <div className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-semibold ${
                  status.isConnected 
                    ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300' 
                    : 'bg-amber-950/40 border-amber-800/60 text-amber-300'
                }`}>
                  <span className={`w-2.5 h-2.5 rounded-full ${status.isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
                  <span>{status.isConnected ? `WhatsApp Conectat (+${status.userPhone || 'Cont'})` : 'Neconectat (Salvare Profil Activă)'}</span>
                </div>

                <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300">
                  {status.avatarCooldownRemaining && status.avatarCooldownRemaining > 0 ? (
                    <>
                      <ShieldAlert className="w-4 h-4 text-amber-400 animate-pulse" />
                      <span className="text-amber-300 font-mono font-bold">Pauză WhatsApp: {status.avatarCooldownRemaining}s</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-300 font-semibold">Gata de Aplicare Instant</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Main 2-Column Interface */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              
              {/* Left Column: Live Preview & Action Control Hub (5 Cols) */}
              <div className="lg:col-span-5 flex flex-col items-center justify-center p-6 bg-slate-950 rounded-2xl border border-slate-800 space-y-5 text-center shadow-inner">
                <div className="flex items-center justify-between w-full pb-2 border-b border-slate-800/80">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Previzualizare Poză Selectată</span>
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">Raport 1:1 • 640x640 px</span>
                </div>
                
                {/* Circular Profile Avatar with Ring */}
                <div className="relative my-2 group">
                  <div className="absolute -inset-2 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full blur-md opacity-30 group-hover:opacity-50 transition-opacity"></div>
                  <img 
                    src={currentAvatarUrl} 
                    alt="Avatar WhatsApp" 
                    className="relative w-52 h-52 sm:w-56 sm:h-56 rounded-full object-cover shadow-2xl border-4 border-emerald-500/60 ring-4 ring-slate-900 bg-slate-900" 
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      const imgEl = e.target as HTMLImageElement;
                      if (!imgEl.dataset.proxied && currentAvatarUrl.startsWith('http')) {
                        imgEl.dataset.proxied = '1';
                        imgEl.src = `/api/images/proxy?url=${encodeURIComponent(currentAvatarUrl)}`;
                      }
                    }}
                  />
                  {updatingAvatar && (
                    <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm rounded-full flex flex-col items-center justify-center text-white text-xs gap-2.5 z-10">
                      <RefreshCw className="w-7 h-7 animate-spin text-emerald-400" />
                      <span className="font-semibold text-emerald-200">Se aplică pe WhatsApp...</span>
                    </div>
                  )}
                </div>

                {/* Primary Button: Apply on WhatsApp */}
                <button 
                  onClick={handleUpdateWhatsAppAvatar}
                  disabled={updatingAvatar}
                  className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white text-sm font-bold rounded-xl shadow-lg shadow-emerald-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                >
                  {updatingAvatar ? <RefreshCw className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                  <span>{status.isConnected ? 'Aplică pe WhatsApp Acum' : 'Salvează Poză în Profil'}</span>
                </button>

                {/* Local Upload from Phone / PC (ANY image format) */}
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileUpload} 
                  accept="image/*,.heic,.heif,.avif,.webp,.svg,.tiff,.tif,.bmp,.ico,.jfif" 
                  className="hidden" 
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-3 bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-200 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer hover:border-slate-500 active:scale-95"
                >
                  <Upload className="w-4 h-4 text-emerald-400" />
                  <span>Încarcă Orice Format de Poză (JPG, PNG, WebP, AVIF, HEIC, SVG)</span>
                </button>

                {/* Instant Next Image in Batch Trigger Button with Live 5-Min Timer */}
                <button
                  type="button"
                  onClick={() => {
                    handleTriggerAutoAvatar();
                    setAutoTimerSeconds(300);
                  }}
                  disabled={updatingAvatar}
                  className="w-full py-3 bg-purple-950/70 hover:bg-purple-900/80 border border-purple-700/70 disabled:opacity-50 text-purple-200 text-xs font-bold rounded-xl transition-all flex flex-col items-center justify-center gap-1.5 cursor-pointer active:scale-95 shadow-md shadow-purple-950/40"
                >
                  <div className="flex items-center gap-2">
                    <RefreshCw className={`w-4 h-4 text-purple-400 ${updatingAvatar ? 'animate-spin' : ''}`} />
                    <span>Schimbă Instant cu Următoarea Poză din Lot</span>
                  </div>
                  <span className="text-[10px] text-purple-300 font-mono font-semibold flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    Rotire automată la 5 min (Următoarea în: {formatCountdown(autoTimerSeconds)})
                  </span>
                </button>

                {/* Reassurance & Anti-Rate-Limit info notice */}
                <div className="p-3 bg-slate-900/90 rounded-xl border border-slate-800/80 text-left space-y-1 w-full">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-300">
                    <Shield className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Protecție Inteligentă Anti-Rate-Limit</span>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-relaxed">
                    Orice format (WebP, AVIF, PNG, JPG, SVG, HEIC, TIFF) este convertit automat în 640x640 JPEG. După ce toate cele 5 poze din lot apar pe profilul WhatsApp, se descarcă automat următorul rând de 5 poze noi.
                  </p>
                </div>
              </div>

              {/* Right Column: Themes, Search, 5-Image Gallery & Auto-Rotation (7 Cols) */}
              <div className="lg:col-span-7 space-y-6">
                
                {/* 5-Image Multi-Site Display Container */}
                <div className="p-6 bg-slate-950 rounded-2xl border border-slate-800 space-y-5 shadow-inner">
                  
                  {/* Realm Category Filter & Thematic Explorer */}
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                        <Flame className="w-4 h-4 text-amber-400" />
                        <span>Alege din Toate Temele Posibile &amp; Imposibile</span>
                      </label>

                      <button
                        type="button"
                        onClick={handleRandomTheme}
                        disabled={generatingAvatar}
                        className="px-3 py-1.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-md shadow-purple-600/30 active:scale-95"
                      >
                        <Shuffle className="w-3.5 h-3.5" />
                        <span>🎲 Surprinde-mă! (Temă Aleatorie)</span>
                      </button>
                    </div>

                    {/* Realm Filter Tabs */}
                    <div className="flex flex-wrap gap-1.5 p-1 bg-slate-900 rounded-xl border border-slate-800/80 text-[11px] font-semibold">
                      {[
                        { id: 'all', label: '🌐 Toate (24)' },
                        { id: 'popular', label: '🌟 Populare' },
                        { id: 'scifi', label: '🚀 Sci-Fi & Viitor' },
                        { id: 'fantasy', label: '🐉 Fantezie' },
                        { id: 'anomalies', label: '🌀 Anomalii & Imposibil' },
                        { id: 'style', label: '🥋 Stil & Pasiuni' },
                      ].map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setThemeGroupFilter(tab.id as any)}
                          className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                            themeGroupFilter === tab.id
                              ? 'bg-emerald-600 text-white shadow-sm'
                              : 'text-slate-400 hover:text-white hover:bg-slate-800'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    {/* 24 Themed Chips */}
                    <div className="flex flex-wrap gap-1.5 pt-1 max-h-48 overflow-y-auto pr-1">
                      {ALL_THEMES
                        .filter(cat => themeGroupFilter === 'all' || cat.group === themeGroupFilter)
                        .map((cat) => (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => {
                              setSelectedThemeCategory(cat.id);
                              setActiveThemeQuery(cat.query);
                              setCustomSearchQuery('');
                              loadPinterestGallery(cat.query, false);
                            }}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                              selectedThemeCategory === cat.id
                                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30 border border-emerald-500 scale-[1.02]'
                                : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 hover:border-slate-700'
                            }`}
                          >
                            <span>{cat.label}</span>
                          </button>
                        ))}
                    </div>
                  </div>

                  {/* Custom Search Bar OR Direct Website/Image URL */}
                  <div className="pt-2 space-y-1.5">
                    <form 
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (customSearchQuery.trim()) {
                          const q = customSearchQuery.trim();
                          setSelectedThemeCategory(q);
                          setActiveThemeQuery(q);
                          loadPinterestGallery(q, false);
                        }
                      }}
                      className="flex gap-2"
                    >
                      <div className="relative flex-1">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input 
                          type="text"
                          value={customSearchQuery}
                          onChange={(e) => setCustomSearchQuery(e.target.value)}
                          placeholder="Caută orice temă sau lipește un link de pe orice site cu poze (https://...)..."
                          className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={generatingAvatar}
                        className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0 shadow-md shadow-emerald-600/20"
                      >
                        <Search className="w-3.5 h-3.5" />
                        <span>Caută / Extrage</span>
                      </button>
                    </form>
                    <p className="text-[10px] text-slate-500">
                      Caută simultan pe Pinterest, Bing Images, Wallhaven, Wikimedia sau lipește direct adresa (URL) a oricărui site / imagini.
                    </p>
                  </div>

                  {/* Exact 5-Image Multi-Site Display Grid */}
                  <div className="space-y-3 pt-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                        <Image className="w-4 h-4 text-emerald-400" />
                        <span>Lotul #{galleryPageOffset + 1} • 5 Poze Noi ({appliedInBatch.length}/5 pe WhatsApp)</span>
                      </label>
                      <label className="flex items-center gap-1.5 text-[10px] text-slate-400 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={autoNextBatchAfter5}
                          onChange={(e) => setAutoNextBatchAfter5(e.target.checked)}
                          className="accent-emerald-500 rounded"
                        />
                        <span>Descarcă alte 5 automat după 5/5 pe WhatsApp</span>
                      </label>
                    </div>

                    {generatingAvatar ? (
                      <div className="py-14 flex flex-col items-center justify-center text-slate-400 text-xs gap-3">
                        <RefreshCw className="w-8 h-8 animate-spin text-emerald-400" />
                        <span className="font-semibold text-slate-300">Se descarcă 5 imagini noi de pe web / Pinterest pentru tema selectată...</span>
                      </div>
                    ) : searchResults.length > 0 ? (
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                        {searchResults.slice(0, 5).map((url, i) => {
                          const isAppliedOnWa = appliedInBatch.includes(url);
                          const isSelected = currentAvatarUrl === url;
                          return (
                            <div 
                              key={`${galleryPageOffset}_${i}`}
                              onClick={() => setCurrentAvatarUrl(url)}
                              className={`rounded-2xl overflow-hidden aspect-square border-2 transition-all cursor-pointer relative group ${
                                isSelected ? 'border-emerald-500 ring-4 ring-emerald-500/25 scale-[1.02] shadow-lg shadow-emerald-950/50' : 'border-slate-800 hover:border-slate-600'
                              }`}
                            >
                              <img 
                                src={url} 
                                alt={`Poză ${i + 1}`} 
                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" 
                                referrerPolicy="no-referrer"
                                onError={(e) => {
                                  const imgEl = e.target as HTMLImageElement;
                                  if (!imgEl.dataset.proxied && url.startsWith('http')) {
                                    imgEl.dataset.proxied = '1';
                                    imgEl.src = `/api/images/proxy?url=${encodeURIComponent(url)}`;
                                  } else {
                                    imgEl.src = `https://picsum.photos/seed/fallback_${galleryPageOffset}_${i}/640/640.jpg`;
                                  }
                                }}
                              />
                              
                              {/* Number badge */}
                              <div className="absolute top-2 left-2 bg-slate-950/80 backdrop-blur-sm px-1.5 py-0.5 rounded-md text-[9px] font-mono font-bold text-slate-200">
                                #{i + 1}
                              </div>

                              {/* Applied on WhatsApp badge */}
                              {isAppliedOnWa && (
                                <div className="absolute bottom-1.5 left-1.5 right-1.5 bg-emerald-600/90 backdrop-blur-sm px-1.5 py-0.5 rounded-md text-[9px] font-bold text-white text-center truncate">
                                  Pe WhatsApp ✓
                                </div>
                              )}

                              {/* Active Checkmark overlay */}
                              {isSelected && (
                                <div className="absolute inset-0 bg-emerald-950/35 backdrop-blur-[1px] flex items-center justify-center">
                                  <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg">
                                    <Check className="w-5 h-5 text-white stroke-[3]" />
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="p-8 text-center text-xs text-slate-400 space-y-3">
                        <p>Nu sunt imagini încărcate.</p>
                        <button
                          onClick={() => loadPinterestGallery(activeThemeQuery || selectedThemeCategory)}
                          className="px-4 py-2 bg-emerald-600 text-white font-bold rounded-xl text-xs"
                        >
                          Încarcă Imagini
                        </button>
                      </div>
                    )}

                    {/* Pagination / Fetch other 5 pictures */}
                    <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
                      <span className="text-[11px] text-slate-500 font-mono">
                        Selecția curentă: #{searchResults.indexOf(currentAvatarUrl) !== -1 ? searchResults.indexOf(currentAvatarUrl) + 1 : 'Personalizată'} din 5 • Lot #{galleryPageOffset + 1}
                      </span>

                      <button
                        onClick={() => loadPinterestGallery(activeThemeQuery, true)}
                        disabled={generatingAvatar}
                        className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-emerald-400 border border-slate-700/80 text-xs font-semibold rounded-xl transition-all flex items-center gap-2 cursor-pointer hover:border-slate-600 active:scale-95"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${generatingAvatar ? 'animate-spin' : ''}`} />
                        <span>Descarcă Alte 5 Poze din Această Temă</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Auto Avatar 24/7 Settings */}
                <div className="p-6 bg-emerald-950/20 rounded-2xl border border-emerald-900/40 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                        <RefreshCw className={`w-4 h-4 ${aiSettings.autoAvatarEnabled ? 'animate-spin' : ''}`} />
                        <span>Rotire Automată Poză WhatsApp 24/7</span>
                      </label>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Asistentul schimbă autonom poza de profil pe contul WhatsApp la fiecare X minute, alegând din tema ta Pinterest.
                      </p>
                    </div>

                    <button
                      onClick={() => handleSaveAISettings({ autoAvatarEnabled: !aiSettings.autoAvatarEnabled })}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none cursor-pointer ${aiSettings.autoAvatarEnabled ? 'bg-emerald-600' : 'bg-slate-700'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${aiSettings.autoAvatarEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Interval rotire (minute):</label>
                      <div className="flex gap-2">
                        <input 
                          type="number"
                          min="1"
                          value={aiSettings.autoAvatarIntervalMinutes}
                          onChange={(e) => setAiSettings(prev => ({ ...prev, autoAvatarIntervalMinutes: Math.max(1, parseInt(e.target.value) || 1) }))}
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                        />
                        <div className="flex gap-1 shrink-0">
                          {[5, 15, 30].map(mins => (
                            <button
                              key={mins}
                              type="button"
                              onClick={() => setAiSettings(prev => ({ ...prev, autoAvatarIntervalMinutes: mins }))}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold ${
                                aiSettings.autoAvatarIntervalMinutes === mins
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-slate-900 text-slate-400 border border-slate-800'
                              }`}
                            >
                              {mins}m
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Cuvânt / Temă de căutare Pinterest:</label>
                      <input 
                        type="text"
                        value={aiSettings.autoAvatarQuery}
                        onChange={(e) => setAiSettings(prev => ({ ...prev, autoAvatarQuery: e.target.value }))}
                        placeholder="ex: scp, mașini, peisaje, anime..."
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      onClick={() => handleSaveAISettings({ 
                        autoAvatarEnabled: aiSettings.autoAvatarEnabled,
                        autoAvatarQuery: aiSettings.autoAvatarQuery, 
                        autoAvatarIntervalMinutes: aiSettings.autoAvatarIntervalMinutes 
                      })}
                      className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-md shadow-emerald-600/20 active:scale-95"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Salvează Setările de Rotire Automată</span>
                    </button>
                  </div>
                </div>

              </div>

            </div>
          </div>
        )}

        {/* ==================== TAB 3: MULTI-AI ENGINE & LIVE WHATSAPP JOURNAL ==================== */}
        {activeTab === 'ai' && (
          <div className="bg-slate-900 rounded-2xl p-8 border border-slate-800 shadow-xl space-y-8">
            
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Brain className="w-5 h-5 text-purple-400" />
                  <span>Motorul Multi-AI WhatsApp &amp; Jurnal Mesaje Reale</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Orchestrație de modele AI (Gemini 3.8 Flash, Gemini 3.1 Flash Lite) activă 24/7 pe WhatsApp.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="px-3 py-1 bg-purple-950/60 border border-purple-800/60 text-purple-300 rounded-lg text-xs font-bold flex items-center gap-1.5">
                  <Cpu className="w-4 h-4 text-purple-400" />
                  <span>Toți AI Activi (Ensemble)</span>
                </span>
              </div>
            </div>

            {/* Multi-AI Model Selector ("Pentru răspunsuri pe WhatsApp să folosești toți ai") */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-emerald-400" />
                  <span>Configurare Modele AI pentru Răspunsuri:</span>
                </span>
                <span className="text-[11px] text-emerald-400 font-semibold">
                  Mod Curent: {aiSettings.mode.toUpperCase()}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {[
                  {
                    id: 'ensemble',
                    name: 'Toți AI (Ensemble)',
                    desc: 'Combină Gemini 3.8 Flash + Flash Lite pentru cel mai inteligent răspuns',
                    badge: 'Recomandat (Toți AI)',
                    color: 'purple',
                    icon: Cpu,
                  },
                  {
                    id: 'flash',
                    name: 'Gemini 3.8 Flash',
                    desc: 'Viteză instantanee și fluență conversațională naturală în limba română',
                    badge: 'Viteză Maximă',
                    color: 'emerald',
                    icon: Zap,
                  },
                  {
                    id: 'lite',
                    name: 'Gemini 3.1 Flash Lite',
                    desc: 'Procesare ușoară, eficiență și latență minimă pentru orice întrebare',
                    badge: 'Eficiență',
                    color: 'amber',
                    icon: Sparkles,
                  },
                ].map((m) => {
                  const Icon = m.icon;
                  const isActive = aiSettings.mode === m.id;
                  return (
                    <button
                      key={m.id}
                      onClick={() => handleSaveAISettings({ mode: m.id as any })}
                      disabled={savingSettings}
                      className={`p-4 rounded-xl border text-left transition-all cursor-pointer relative group ${
                        isActive
                          ? 'border-purple-500 bg-purple-950/30 ring-2 ring-purple-500/30'
                          : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isActive ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${isActive ? 'bg-purple-500/30 text-purple-300' : 'bg-slate-800 text-slate-500'}`}>
                          {m.badge}
                        </span>
                      </div>
                      <div className="text-xs font-bold text-white">{m.name}</div>
                      <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">{m.desc}</p>
                      {isActive && (
                        <div className="mt-2 text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          <span>Activ pe WhatsApp</span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* System Persona Instructions */}
            <div className="p-5 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300">Instrucțiuni de Personalitate Asistent (System Prompt):</span>
                <span className="text-[10px] text-slate-500">Se aplică pe toate modelele AI</span>
              </div>
              <textarea 
                value={aiSettings.systemInstruction}
                onChange={(e) => setAiSettings((prev: AISettings) => ({ ...prev, systemInstruction: e.target.value }))}
                rows={2}
                className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <div className="flex justify-end">
                <button
                  onClick={() => handleSaveAISettings({ systemInstruction: aiSettings.systemInstruction })}
                  disabled={savingSettings}
                  className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  {savingSettings ? 'Se salvează...' : 'Salvează Instrucțiuni'}
                </button>
              </div>
            </div>

            {/* Sandbox AI Tester Box */}
            <div className="p-5 bg-purple-950/20 rounded-2xl border border-purple-900/40 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-purple-300 uppercase tracking-wider">
                  <Bot className="w-4 h-4 text-purple-400" />
                  <span>Testare Instant Răspuns Alexia AI (Sandbox)</span>
                </div>
                <span className="text-[10px] text-purple-400 font-mono">Mod: {aiSettings.mode}</span>
              </div>

              <form onSubmit={handleTestAiReply} className="space-y-3">
                <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                  <span className="text-slate-400 font-bold">Exemple rapide de testare:</span>
                  <button type="button" onClick={() => setTestMsgInput('@Alexandru trimite un mesaj vocal cu Salut, ce faci?')} className="px-2.5 py-1 bg-purple-900/40 hover:bg-purple-800/60 text-purple-300 rounded-lg border border-purple-700/50 cursor-pointer">🎤 Mesaj Vocal PTT</button>
                  <button type="button" onClick={() => setTestMsgInput('@Alexandru trimite un video cu masini')} className="px-2.5 py-1 bg-purple-900/40 hover:bg-purple-800/60 text-purple-300 rounded-lg border border-purple-700/50 cursor-pointer">🎬 Video MP4</button>
                  <button type="button" onClick={() => setTestMsgInput('@Alexandru trimite o poza cu peisaj')} className="px-2.5 py-1 bg-purple-900/40 hover:bg-purple-800/60 text-purple-300 rounded-lg border border-purple-700/50 cursor-pointer">🖼️ Imagine</button>
                </div>

                <div className="flex gap-2">
                  <input 
                    type="text"
                    value={testMsgInput}
                    onChange={(e) => setTestMsgInput(e.target.value)}
                    placeholder="Scrie un mesaj de test (ex: Salut @Alexandru)..."
                    className="flex-1 px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium"
                  />
                  <button
                    type="submit"
                    disabled={testMsgLoading || !testMsgInput.trim()}
                    className="px-5 py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs flex items-center gap-2 cursor-pointer transition-all active:scale-95 shrink-0"
                  >
                    {testMsgLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    <span>Trimite Mesaj de Test</span>
                  </button>
                </div>
              </form>

              {testMsgReply && (
                <div className="p-4 bg-slate-950 rounded-xl border border-purple-800/50 space-y-1.5 animate-fadeIn">
                  <div className="flex items-center justify-between text-[11px] font-bold text-purple-400">
                    <span className="flex items-center gap-1.5">
                      <Bot className="w-4 h-4" />
                      Răspuns Generat de Alexia AI:
                    </span>
                    <span className="px-2 py-0.5 rounded bg-purple-900/40 text-purple-300 font-mono text-[9px]">
                      {testMsgReply.modelUsed}
                    </span>
                  </div>
                  <p className="text-xs text-purple-100 italic leading-relaxed pl-5 border-l-2 border-purple-500/50">
                    "{testMsgReply.text}"
                  </p>
                </div>
              )}
            </div>

            {/* REAL WHATSAPP LIVE JOURNAL + PERSISTENT HISTORY */}
            <div className="space-y-6 pt-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs font-bold text-slate-400">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-emerald-400" />
                  <span>Istoric Mesaje Cloud SQL Permanent ({persistentMessages.length})</span>
                </div>
                <div className="flex items-center gap-3">
                  {/* VIP Filter Switcher */}
                  <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 gap-1">
                    <button
                      onClick={() => setVipFilterOnly(false)}
                      className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                        !vipFilterOnly ? 'bg-slate-800 text-white shadow' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Toate ({persistentMessages.length})
                    </button>
                    <button
                      onClick={() => setVipFilterOnly(true)}
                      className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                        vipFilterOnly ? 'bg-amber-950/80 border border-amber-600/60 text-amber-300 shadow' : 'text-slate-400 hover:text-amber-300'
                      }`}
                    >
                      <Crown className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                      <span>Doar VIP ({persistentMessages.filter(m => isVipContact(m.sender, m.senderName)).length})</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span className="text-[10px] text-slate-500">Stocat 24/7</span>
                  </div>
                  <button 
                    onClick={() => {
                      fetchPersistentMessages();
                      fetchVipContacts();
                    }}
                    className="p-1.5 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer text-slate-400 hover:text-white"
                    title="Actualizează mesaje și contacte VIP"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* VIP Contacts Management Bar */}
              <div className="p-4 bg-slate-950/80 rounded-2xl border border-amber-500/30 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
                      <Crown className="w-4 h-4 fill-amber-400" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-white flex items-center gap-2">
                        <span>Contacte Marcate ca VIP ({vipContacts.length})</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold">Prioritate Înaltă</span>
                      </span>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Mesajele primite de la acești contacti sunt evidențiate cu ramă aurie, coroană și marcaj vizual distinct.
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => setShowAddVipModal(prev => !prev)}
                    className="px-3 py-1.5 bg-amber-950/50 hover:bg-amber-900/60 border border-amber-600/50 text-amber-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer self-start sm:self-auto"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{showAddVipModal ? 'Închide Formular' : 'Adaugă Contact VIP'}</span>
                  </button>
                </div>

                {/* Inline Add VIP Form */}
                {showAddVipModal && (
                  <form onSubmit={handleAddVipManual} className="p-3.5 bg-slate-900 rounded-xl border border-amber-500/40 space-y-3 animate-fadeIn">
                    <div className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                      <UserPlus className="w-4 h-4" />
                      <span>Înregistrează un Contact sau Conversație ca VIP:</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <input 
                        type="text" 
                        value={newVipPhone} 
                        onChange={(e) => setNewVipPhone(e.target.value)} 
                        placeholder="Număr de telefon sau identificator (ex: 40712345678)"
                        className="px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                      <input 
                        type="text" 
                        value={newVipName} 
                        onChange={(e) => setNewVipName(e.target.value)} 
                        placeholder="Nume contact VIP (ex: Client VIP, Familia)"
                        className="px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button 
                        type="button" 
                        onClick={() => setShowAddVipModal(false)}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold cursor-pointer"
                      >
                        Anulează
                      </button>
                      <button 
                        type="submit" 
                        disabled={vipActionLoading || (!newVipPhone.trim() && !newVipName.trim())}
                        className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-slate-950 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-md transition-all"
                      >
                        <Crown className="w-3.5 h-3.5 fill-slate-950" />
                        <span>Salvează Contact VIP</span>
                      </button>
                    </div>
                  </form>
                )}

                {/* VIP Chips list */}
                {vipContacts.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {vipContacts.map((vip, idx) => (
                      <div 
                        key={vip.jid || idx} 
                        className="px-2.5 py-1 rounded-xl bg-amber-950/60 border border-amber-600/40 text-amber-200 text-xs flex items-center gap-2 shadow-sm"
                      >
                        <Crown className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                        <span className="font-bold">{vip.name}</span>
                        {vip.phone && <span className="text-[10px] text-amber-400/80 font-mono">({vip.phone})</span>}
                        <button
                          type="button"
                          onClick={() => handleDeleteVip(vip.jid || vip.name, vip.name)}
                          className="text-amber-400/60 hover:text-red-400 p-0.5 rounded transition-colors cursor-pointer"
                          title="Elimină din lista VIP"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500 italic">
                    Niciun contact marcat ca VIP încă. Poți marca direct din jurnalul de mesaje cu butonul coroană (👑) sau adăuga prin formularul de mai sus.
                  </p>
                )}
              </div>

              {persistentMessages.length === 0 ? (
                <div className="p-8 text-center bg-slate-950/60 rounded-xl border border-slate-800 text-slate-400 text-xs space-y-2">
                  <Bot className="w-8 h-8 text-purple-400 mx-auto" />
                  <p className="font-semibold text-white">Niciun mesaj stocat în Cloud SQL încă</p>
                  <p className="text-[11px] text-slate-500 max-w-md mx-auto">
                    Toate mesajele WhatsApp care includ @Alexandru vor fi salvate permanent în baza de date Cloud SQL us-east1.
                  </p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                  {persistentMessages
                    .filter(msg => {
                      if (!vipFilterOnly) return true;
                      return isVipContact(msg.sender, msg.senderName);
                    })
                    .map((msg: PersistentMessage) => {
                      const isAi = msg.sender === 'ai';
                      const isVip = !isAi && isVipContact(msg.sender, msg.senderName);

                      return (
                        <div 
                          key={msg.id} 
                          className={`p-4 rounded-2xl border transition-all ${
                            isVip
                              ? 'bg-gradient-to-r from-amber-950/50 via-slate-900 to-slate-950 border-amber-500/70 shadow-lg shadow-amber-500/10 ring-1 ring-amber-500/30'
                              : isAi
                              ? 'bg-purple-950/20 border-purple-800/30 hover:bg-slate-900/80'
                              : 'bg-slate-950 border-slate-800/80 hover:bg-slate-900/80'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-4 mb-2">
                            <div className="flex items-center gap-2">
                              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                                isVip 
                                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30' 
                                  : isAi 
                                  ? 'bg-purple-600 text-white' 
                                  : 'bg-slate-800 text-slate-400'
                              }`}>
                                {isVip ? (
                                  <Crown className="w-4 h-4 fill-slate-950" />
                                ) : isAi ? (
                                  <Bot className="w-3.5 h-3.5" />
                                ) : (
                                  <User className="w-3.5 h-3.5" />
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`text-[12px] font-bold ${
                                  isVip ? 'text-amber-300' : isAi ? 'text-purple-400' : 'text-emerald-400'
                                }`}>
                                  {msg.senderName || msg.sender}
                                </span>

                                {/* DISTINCT VIP BADGE */}
                                {isVip && (
                                  <span className="px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-500/30 to-yellow-500/30 border border-amber-500/60 text-amber-300 font-extrabold text-[10px] flex items-center gap-1 shadow-sm tracking-wide">
                                    <Crown className="w-3 h-3 text-amber-400 fill-amber-400" />
                                    <span>VIP</span>
                                  </span>
                                )}

                                {msg.modelUsed && (
                                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[9px] text-slate-400 font-bold border border-slate-700">
                                    {msg.modelUsed}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {/* One-click VIP Toggle Button for Contact */}
                              {!isAi && (
                                <button
                                  type="button"
                                  onClick={() => handleToggleVip(msg.sender, msg.senderName)}
                                  disabled={vipActionLoading}
                                  className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                                    isVip
                                      ? 'bg-amber-500/25 border border-amber-500/50 text-amber-300 hover:bg-amber-500/40 shadow-sm'
                                      : 'bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-amber-300'
                                  }`}
                                  title={isVip ? 'Apasă pentru a elimina contactul din VIP' : 'Marchează acest contact ca VIP'}
                                >
                                  <Crown className={`w-3 h-3 ${isVip ? 'fill-amber-400 text-amber-400' : 'text-slate-400'}`} />
                                  <span>{isVip ? 'VIP Activ' : 'Marchează VIP'}</span>
                                </button>
                              )}

                              <span className="text-[9px] text-slate-500 font-mono whitespace-nowrap">
                                {new Date(msg.createdAt).toLocaleString('ro-RO', { 
                                  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' 
                                })}
                              </span>
                            </div>
                          </div>

                          <p className={`text-xs leading-relaxed pl-9 ${isVip ? 'text-amber-100 font-medium' : 'text-slate-300'}`}>
                            {msg.text}
                          </p>

                          {msg.aiReply && isAi && (
                            <div className="mt-2 pl-8 border-l border-purple-500/30 ml-3 py-1">
                              <div className="text-[10px] font-bold text-purple-400 mb-0.5 flex items-center gap-1">
                                <Sparkles className="w-3 h-3" />
                                Răspuns Generat:
                              </div>
                              <p className="text-xs text-purple-200 italic">
                                {msg.aiReply}
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}

              {/* In-memory Status Logs (System only) */}
              <div className="space-y-2 pt-4">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Evenimente Sistem Live:</div>
                <div className="space-y-1.5">
                  {status.logs.filter((l: any) => l.sender === 'system').slice(0, 5).map((log: any) => (
                    <div key={log.id} className="flex items-center gap-2 text-[10px] text-slate-500 bg-slate-900/40 p-2 rounded-lg border border-slate-800/50">
                      <span className="font-mono opacity-50">{log.time}</span>
                      <span className="w-1 h-1 rounded-full bg-slate-700"></span>
                      <span>{log.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>
        )}

        {/* ==================== TAB 4: AUTONOMOUS AI "cd" TERMINAL PC ==================== */}
        {activeTab === 'cd' && (
          <div className="bg-slate-950 rounded-2xl border-2 border-emerald-500/40 shadow-2xl overflow-hidden space-y-0 font-mono">
            
            {/* PC Terminal Header Bar */}
            <div className="bg-slate-900 px-5 py-3 border-b border-slate-800 flex items-center justify-between text-xs">
              <div className="flex items-center gap-3">
                {/* Mac/Linux PC Window Controls */}
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500"></div>
                  <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                  <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                </div>
                <span className="text-emerald-400 font-bold tracking-wide flex items-center gap-2">
                  <Terminal className="w-4 h-4" />
                  <span>cd OS v3.8 Autonomous Workstation [root@whatsomni-cloud-sql]</span>
                </span>
              </div>

              <div className="flex items-center gap-3 text-[10px] text-slate-400">
                <span className="flex items-center gap-1 text-emerald-400 font-bold bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/60">
                  <Activity className="w-3 h-3" />
                  <span>AUTONOMOUS_KERNEL_ONLINE</span>
                </span>
                <span>HEAP: {cdStatus?.memoryUsageMb || 24}MB</span>
                <span>UPTIME: {cdStatus?.uptimeSeconds || 0}s</span>
              </div>
            </div>

            {/* Quick Action Buttons Toolbar */}
            <div className="p-3 bg-slate-900/60 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleRunCdAutoHeal}
                  disabled={cdExecuting}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 cursor-pointer shadow transition-all active:scale-95"
                >
                  <Wrench className="w-3.5 h-3.5" />
                  <span>[cd fix] Auto-Reparare Autonomă</span>
                </button>

                <button
                  onClick={() => handleExecuteCdCommand('cd test')}
                  disabled={cdExecuting}
                  className="px-3.5 py-1.5 bg-purple-950 hover:bg-purple-900 border border-purple-700/60 text-purple-200 font-bold rounded-lg text-xs flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
                >
                  <Play className="w-3.5 h-3.5 text-purple-400" />
                  <span>[cd test] Rulează Suita de Teste</span>
                </button>

                <button
                  onClick={() => handleExecuteCdCommand('cd status')}
                  disabled={cdExecuting}
                  className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-lg text-xs flex items-center gap-1.5 cursor-pointer border border-slate-700"
                >
                  <Monitor className="w-3.5 h-3.5 text-cyan-400" />
                  <span>[cd status] Diag Sistem</span>
                </button>
              </div>

              <button
                onClick={() => handleExecuteCdCommand('cd clear')}
                className="px-3 py-1 bg-slate-900 hover:bg-slate-800 text-slate-400 text-[11px] rounded border border-slate-800 cursor-pointer"
              >
                Șterge Consola
              </button>
            </div>

            {/* Main Terminal PC Workstation Body (Split View) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-0">
              
              {/* Left Column: Interactive Terminal Console (2 Cols) */}
              <div className="lg:col-span-2 p-5 bg-slate-950 space-y-4 border-r border-slate-800/80 flex flex-col justify-between min-h-[500px]">
                
                {/* Terminal Output Stream */}
                <div className="space-y-3 overflow-y-auto max-h-[480px] pr-2 custom-scrollbar text-xs leading-relaxed font-mono">
                  {cdTerminalLogs.map((log) => {
                    const isCd = log.sender === 'cd';
                    const isUser = log.sender === 'user';
                    return (
                      <div 
                        key={log.id} 
                        className={`p-3 rounded-xl border ${
                          isCd ? 'bg-slate-900/90 border-emerald-500/30 text-emerald-300' :
                          isUser ? 'bg-slate-900 border-purple-500/30 text-purple-200' :
                          'bg-slate-900/40 border-slate-800 text-slate-400'
                        }`}
                      >
                        <div className="flex items-center justify-between opacity-60 text-[10px] mb-1 font-mono">
                          <span className="font-bold uppercase tracking-wider">
                            {isCd ? '🤖 AI Agent cd (Autonomous Kernel)' : isUser ? '👤 Operator (You)' : '⚙️ System Kernel'}
                          </span>
                          <span>{log.time}</span>
                        </div>
                        <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed overflow-x-auto">
                          {log.text}
                        </pre>
                      </div>
                    );
                  })}
                  {cdExecuting && (
                    <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2 animate-pulse">
                      <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                      <span>AI "cd" procesează comanda și testează codul...</span>
                    </div>
                  )}
                </div>

                {/* Command Chips & Terminal Input Form */}
                <div className="space-y-3 pt-3 border-t border-slate-800/80">
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                    <span className="text-slate-500 font-bold">Comenzi rapide:</span>
                    <button onClick={() => handleExecuteCdCommand('cd fix')} className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 text-emerald-400 rounded border border-slate-800 cursor-pointer">cd fix</button>
                    <button onClick={() => handleExecuteCdCommand('cd test')} className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 text-purple-400 rounded border border-slate-800 cursor-pointer">cd test</button>
                    <button onClick={() => handleExecuteCdCommand('cd Scrie o funcție TypeScript pentru procesat mesaje')} className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 text-cyan-400 rounded border border-slate-800 cursor-pointer">cd Scrie Cod TS</button>
                  </div>

                  <form 
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleExecuteCdCommand();
                    }}
                    className="flex gap-2"
                  >
                    <div className="relative flex-1">
                      <span className="absolute left-3.5 top-3.5 text-emerald-400 font-bold font-mono">$</span>
                      <input 
                        type="text"
                        value={cdCommand}
                        onChange={(e) => setCdCommand(e.target.value)}
                        placeholder="Tastează comanda sau întrebare pentru AI 'cd' (ex: cd fix, scrie cod pentru...)..."
                        className="w-full pl-8 pr-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono text-emerald-300 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={cdExecuting || !cdCommand.trim()}
                      className="px-5 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl flex items-center gap-2 cursor-pointer transition-all active:scale-95 shrink-0"
                    >
                      {cdExecuting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                      <span>Execută</span>
                    </button>
                  </form>
                </div>

              </div>

              {/* Right Column: Real-Time Diagnostic Dashboard & Auto-Heal Monitor */}
              <div className="p-5 bg-slate-900/50 space-y-6">
                
                {/* Kernel Status Badge */}
                <div className="p-4 bg-emerald-950/40 rounded-xl border border-emerald-500/40 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 uppercase">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <span>NUCLEU "cd" AUTONOM</span>
                    </span>
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Sistemul de auto-reparare autonom verifică rețeaua WhatsApp, cotele Gemini AI și stocarea permanentă Cloud SQL.
                  </p>
                </div>

                {/* Diagnostics Grid */}
                <div className="space-y-3">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Monitor Servicii Sistem:</span>
                  
                  <div className="space-y-2 text-xs">
                    <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
                      <span className="text-slate-300 flex items-center gap-2">
                        <Smartphone className="w-4 h-4 text-emerald-400" />
                        <span>Socket WhatsApp:</span>
                      </span>
                      {status.isConnected ? (
                        <span className="text-emerald-400 font-bold flex items-center gap-1">
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>CONNECTED</span>
                        </span>
                      ) : (
                        <span className="text-amber-400 font-bold flex items-center gap-1">
                          <ShieldAlert className="w-3.5 h-3.5" />
                          <span>AWAITING SCAN</span>
                        </span>
                      )}
                    </div>

                    <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
                      <span className="text-slate-300 flex items-center gap-2">
                        <Database className="w-4 h-4 text-purple-400" />
                        <span>Cloud SQL Persistence:</span>
                      </span>
                      <span className="text-emerald-400 font-bold flex items-center gap-1">
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>100% HEALTHY</span>
                      </span>
                    </div>

                    <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
                      <span className="text-slate-300 flex items-center gap-2">
                        <Cpu className="w-4 h-4 text-cyan-400" />
                        <span>Multi-AI Orchestration:</span>
                      </span>
                      <span className="text-emerald-400 font-bold flex items-center gap-1">
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>ACTIVE</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Recent Auto-Heal Events Feed */}
                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Jurnal Auto-Reparare "cd":</span>
                  <div className="space-y-2 max-h-[180px] overflow-y-auto custom-scrollbar">
                    {cdStatus?.autoHealLogs?.map((log: any) => (
                      <div key={log.id} className="p-2.5 bg-slate-950 rounded-lg border border-slate-800 text-[10px] space-y-0.5">
                        <div className="flex items-center justify-between text-slate-500">
                          <span>{log.time}</span>
                          <span className={`font-bold ${log.status === 'SUCCESS' ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {log.status}
                          </span>
                        </div>
                        <p className="text-slate-300 font-semibold">{log.action}</p>
                      </div>
                    ))}
                  </div>
                </div>

              </div>

            </div>

          </div>
        )}

        {/* TAB 5: TUNEL ZROK (SITE PUBLIC PE ZROK.IO) */}
        {activeTab === 'zrok' && (
          <div className="space-y-6">
            <div className="bg-slate-900 rounded-3xl border border-cyan-500/30 p-6 md:p-8 shadow-2xl space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                    <Globe className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                      <span>Accesare completă prin Zrok</span>
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700">
                        {zrokStatus?.version || 'v2.0.9'}
                      </span>
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Expune întregul site (Interfață Web + API + Bot WhatsApp + Poze) printr-un tunel HTTPS securizat <code className="text-cyan-300">*.zrok.io</code>.
                    </p>
                  </div>
                </div>

                <div className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-bold ${
                  zrokStatus?.isRunning && zrokStatus?.publicUrl
                    ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300'
                    : zrokStatus?.isEnabled
                    ? 'bg-amber-950/50 border-amber-700/50 text-amber-300'
                    : 'bg-slate-950 border-slate-800 text-slate-400'
                }`}>
                  <span className={`w-2.5 h-2.5 rounded-full ${
                    zrokStatus?.isRunning && zrokStatus?.publicUrl
                      ? 'bg-emerald-400 animate-pulse'
                      : zrokStatus?.isEnabled
                      ? 'bg-amber-400'
                      : 'bg-slate-600'
                  }`} />
                  <span>
                    {zrokStatus?.isRunning && zrokStatus?.publicUrl
                      ? 'LIVE PE ZROK'
                      : zrokStatus?.isEnabled
                      ? 'ZROK ACTIVAT (OPRIT)'
                      : 'NECESITĂ TOKEN ZROK'}
                  </span>
                </div>
              </div>

              {/* Live Public URL Box */}
              {zrokStatus?.isRunning && zrokStatus?.publicUrl && (
                <div className="p-5 bg-emerald-950/30 border border-emerald-600/40 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                      Link-ul Public al Site-ului prin Zrok:
                    </span>
                    <div className="font-mono text-sm md:text-base font-bold text-white truncate">
                      {zrokStatus.publicUrl}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleCopyZrokUrl(zrokStatus.publicUrl!)}
                      className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 border border-slate-700 cursor-pointer"
                    >
                      {zrokCopiedUrl ? <CheckCheck className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-slate-300" />}
                      <span>{zrokCopiedUrl ? 'Copiat!' : 'Copiază Link'}</span>
                    </button>
                    <a
                      href={zrokStatus.publicUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>Deschide Site</span>
                    </a>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Step 1: Zrok Token & Enable */}
                <div className="bg-slate-950 rounded-2xl border border-slate-800 p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <KeyRound className="w-4 h-4 text-cyan-400" />
                      <span>1. Token cont Zrok {zrokStatus?.isEnabled ? '(Configurat ✓)' : ''}</span>
                    </h3>
                    {zrokStatus?.maskedToken && (
                      <span className="text-[11px] font-mono px-2 py-0.5 bg-slate-900 text-slate-400 rounded border border-slate-800">
                        {zrokStatus.maskedToken}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-400 leading-relaxed">
                    Obține un token gratuit din contul tău{' '}
                    <a
                      href="https://api-v2.zrok.io"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-cyan-400 hover:underline font-semibold"
                    >
                      api-v2.zrok.io
                    </a>{' '}
                    (secțiunea <em>Account Token / Enable Environment</em>) și lipește-l mai jos o singură dată.
                  </p>

                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={zrokTokenInput}
                      onChange={(e) => setZrokTokenInput(e.target.value)}
                      placeholder={zrokStatus?.isEnabled ? 'Introdu alt token doar dacă vrei să-l schimbi...' : 'Lipește tokenul tău Zrok aici...'}
                      className="flex-1 px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500"
                    />
                    <button
                      onClick={handleEnableZrok}
                      disabled={zrokActionLoading || !zrokTokenInput.trim()}
                      className="px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer"
                    >
                      Activează Token
                    </button>
                  </div>

                  {zrokStatus?.isEnabled && (
                    <div className="flex items-center justify-between pt-2 border-t border-slate-900 text-[11px]">
                      <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Mediul local zrok2 este activat și salvat persistent.</span>
                      </span>
                      <button
                        onClick={handleDisableZrok}
                        disabled={zrokActionLoading}
                        className="text-red-400 hover:text-red-300 font-semibold cursor-pointer"
                      >
                        Dezactivează
                      </button>
                    </div>
                  )}
                </div>

                {/* Step 2: Start / Stop Tunnel & Options */}
                <div className="bg-slate-950 rounded-2xl border border-slate-800 p-5 space-y-4">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-400" />
                    <span>2. Pornire Tunel Public (Întregul Site)</span>
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-400">
                        Subdomeniu personalizat (opțional)
                      </label>
                      <input
                        type="text"
                        value={zrokCustomNameInput}
                        onChange={(e) => setZrokCustomNameInput(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                        placeholder="ex: alexia-whatsapp"
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-400">
                        Parolă Basic Auth (opțional)
                      </label>
                      <input
                        type="text"
                        value={zrokBasicAuthInput}
                        onChange={(e) => setZrokBasicAuthInput(e.target.value)}
                        placeholder="ex: admin:parola123"
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                  </div>

                  <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={zrokAutoStartInput}
                      onChange={(e) => setZrokAutoStartInput(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500"
                    />
                    <span>Pornește tunelul Zrok automat la fiecare pornire a serverului</span>
                  </label>

                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <button
                      onClick={handleStartZrok}
                      disabled={zrokActionLoading || (!zrokStatus?.isEnabled && !zrokTokenInput.trim())}
                      className="flex-1 min-w-[180px] px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {zrokActionLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                      <span>{zrokStatus?.isRunning ? 'Repornește prin Zrok' : 'Pornește Site-ul prin Zrok'}</span>
                    </button>
                    {zrokStatus?.isRunning && (
                      <button
                        onClick={handleStopZrok}
                        disabled={zrokActionLoading}
                        className="px-4 py-2.5 bg-red-600/80 hover:bg-red-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Square className="w-3.5 h-3.5" />
                        <span>Oprește</span>
                      </button>
                    )}
                    <button
                      onClick={handleTestZrok}
                      disabled={zrokTestLoading}
                      className="px-4 py-2.5 bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/40 text-cyan-300 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      {zrokTestLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />}
                      <span>{zrokTestLoading ? 'Se testează...' : 'Testează Zrok'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Zrok Diagnostic Test Report */}
              {zrokTestReport && (
                <div className="bg-slate-950 rounded-2xl border border-cyan-500/30 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-2">
                      <Activity className="w-4 h-4 text-cyan-400" />
                      <span>Rezultat Test Diagnostic Zrok</span>
                    </span>
                    <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded border ${
                      zrokTestReport.overallStatus === 'LIVE' || zrokTestReport.overallStatus === 'READY'
                        ? 'bg-emerald-950/60 border-emerald-700 text-emerald-300'
                        : zrokTestReport.overallStatus === 'NEEDS_TOKEN'
                        ? 'bg-amber-950/60 border-amber-700 text-amber-300'
                        : 'bg-red-950/60 border-red-700 text-red-300'
                    }`}>
                      {zrokTestReport.overallStatus}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {zrokTestReport.checks.map((chk) => (
                      <div key={chk.id} className="p-3 bg-slate-900/70 rounded-xl border border-slate-800 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-white">{chk.name}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            chk.status === 'PASS'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : chk.status === 'WARN'
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-red-500/20 text-red-300'
                          }`}>
                            {chk.status} ({chk.durationMs}ms)
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed">{chk.details}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Error & Logs Console */}
              {zrokStatus?.error && (
                <div className="p-3.5 bg-red-950/50 border border-red-700/50 rounded-xl text-xs text-red-200 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{zrokStatus.error}</span>
                </div>
              )}

              <div className="bg-slate-950 rounded-2xl border border-slate-800 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Jurnal live zrok2</span>
                  </span>
                  <button
                    onClick={fetchZrokStatus}
                    className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Reîmprospătează</span>
                  </button>
                </div>
                <div className="bg-black/60 rounded-xl p-3 font-mono text-[11px] text-slate-300 max-h-44 overflow-y-auto space-y-1">
                  {zrokStatus?.logs && zrokStatus.logs.length > 0 ? (
                    zrokStatus.logs.map((line, idx) => (
                      <div key={idx} className="break-all leading-relaxed">
                        {line}
                      </div>
                    ))
                  ) : (
                    <div className="text-slate-500">Niciun eveniment Zrok înregistrat încă. Introdu tokenul și pornește tunelul pentru a primi URL-ul public.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
