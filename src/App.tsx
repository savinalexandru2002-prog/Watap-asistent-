import React, { useState, useEffect, useRef } from 'react';
import { 
  QrCode, MessageCircle, RefreshCw, CheckCircle2, Smartphone, 
  ShieldCheck, Sparkles, LogOut, Bot, Check, Upload, Image, 
  KeyRound, ArrowLeftRight, Copy, CheckCheck, UserCheck, Cloud,
  Cpu, Zap, Brain, Sliders, Database, Lock, User, LogIn,
  Terminal, Monitor, Wrench, Activity, Play, ShieldAlert, CheckCircle
} from 'lucide-react';
import { auth, googleAuthProvider } from './lib/firebase.ts';
import { onAuthStateChanged, signInWithPopup, signOut, User as FirebaseUser } from 'firebase/auth';

interface WhatsAppStatus {
  isConnected: boolean;
  isRegistered?: boolean;
  connectionMethod?: 'qr' | 'pairing';
  qrCodeUrl: string | null;
  pairingCode: string | null;
  userPhone: string | null;
  userName: string | null;
  connectedAt: string | null;
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

export default function App() {
  const [activeTab, setActiveTab] = useState<'connect' | 'avatar' | 'ai' | 'cd'>('connect');
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
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
  const [copiedCode, setCopiedCode] = useState(false);

  // Profile Picture state
  const [currentAvatarUrl, setCurrentAvatarUrl] = useState('https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=640&auto=format&fit=crop&q=85');
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [generatingAvatar, setGeneratingAvatar] = useState(false);
  const [updatingAvatar, setUpdatingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  const fetchCdStatus = async () => {
    try {
      const res = await fetch('/api/cd/status');
      const data = await res.json();
      if (data.success) {
        setCdStatus(data);
      }
    } catch (e) {
      console.error('Fetch cd status error:', e);
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

  const loadPinterestGallery = async () => {
    setGeneratingAvatar(true);
    try {
      const res = await fetch('/api/ai/search-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: aiSettings.autoAvatarQuery || 'pinterest wallpaper aesthetic' }),
      });
      const data = await res.json();
      if (data.images && data.images.length > 0) {
        const images5 = data.images.slice(0, 5);
        setSearchResults(images5);
        if (!currentAvatarUrl || !images5.includes(currentAvatarUrl)) {
          setCurrentAvatarUrl(images5[0]);
        }
      }
    } catch (e) {
      console.error('Load Pinterest gallery error:', e);
    } finally {
      setGeneratingAvatar(false);
    }
  };

  // Auto-fetch 5 Pinterest images when opening profile picture tab
  useEffect(() => {
    if (activeTab === 'avatar' && searchResults.length === 0) {
      loadPinterestGallery();
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

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setAuthLoading(false);
      if (u) {
        // Sync user with backend
        try {
          const token = await u.getIdToken();
          await fetch('/api/auth/sync', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
          });
        } catch (e) {
          console.error('Auth sync error:', e);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // Poll status every 2.5s for live session status & real WhatsApp message stream
  useEffect(() => {
    if (!user) return;
    fetchStatus();
    fetchAISettings();
    fetchCloudSqlStats();
    fetchPersistentMessages();
    const interval = setInterval(() => {
      fetchStatus();
      fetchCloudSqlStats();
    }, 2500);
    return () => clearInterval(interval);
  }, [user]);

  // Refresh persistent messages less frequently
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(fetchPersistentMessages, 10000);
    return () => clearInterval(interval);
  }, [user]);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/whatsapp/status');
      const data: WhatsAppStatus = await res.json();
      setStatus(data);
      if (data.pairingCode && activeMethod !== 'pairing') {
        setActiveMethod('pairing');
      }
    } catch (e) {
      console.error('Fetch status error:', e);
    }
  };

  const fetchAISettings = async () => {
    try {
      const res = await fetch('/api/ai/settings');
      const data: AISettings = await res.json();
      setAiSettings(data);
    } catch (e) {
      console.error('Fetch AI settings error:', e);
    }
  };

  const fetchCloudSqlStats = async () => {
    try {
      const res = await fetch('/api/cloudsql/stats');
      const data = await res.json();
      setCloudSqlStats(data);
    } catch (e) {
      console.error('Fetch Cloud SQL stats error:', e);
    }
  };

  const fetchPersistentMessages = async () => {
    try {
      const res = await fetch('/api/whatsapp/messages?limit=50');
      const data = await res.json();
      if (data.success) {
        setPersistentMessages(data.messages);
      }
    } catch (e) {
      console.error('Fetch persistent messages error:', e);
    }
  };

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch (e) {
      console.error('Login error:', e);
      setActionNotice({ type: 'error', text: 'Eroare la autentificare cu Google.' });
    }
  };

  const handleLogout = async () => {
    try {
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

    if (targetMethod === 'qr') {
      setLoading(true);
      try {
        const res = await fetch('/api/whatsapp/switch-method', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ method: 'qr' }),
        });
        const data = await res.json();
        if (data.success) {
          setActionNotice({ type: 'info', text: 'Comutat la Scanare Cod QR. Scanează codul de pe ecran cu WhatsApp.' });
          await fetchStatus();
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
  };

  // Request 8-digit pairing code with phone number
  const handleRequestPairingCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumberInput.trim()) {
      setActionNotice({ type: 'error', text: 'Te rugăm să introduci numărul de telefon cu prefixul de țară (ex: 40712345678).' });
      return;
    }

    setLoading(true);
    setActionNotice({ type: 'info', text: 'Se generează codul de asociere de la serverele WhatsApp...' });
    try {
      const res = await fetch('/api/whatsapp/switch-method', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'pairing', phoneNumber: phoneNumberInput }),
      });
      const data = await res.json();
      if (data.success && data.pairingCode) {
        setActionNotice({ type: 'success', text: `Cod generat: ${data.pairingCode}! Introdu-l pe telefon în WhatsApp.` });
        await fetchStatus();
      } else {
        setActionNotice({ type: 'error', text: data.error || 'Nu s-a putut genera codul de asociere.' });
      }
    } catch (e) {
      setActionNotice({ type: 'error', text: 'Eroare de conexiune la generarea codului de asociere.' });
    } finally {
      setLoading(false);
    }
  };

  const copyPairingCodeToClipboard = () => {
    if (!status.pairingCode) return;
    navigator.clipboard.writeText(status.pairingCode.replace('-', ''));
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setActionNotice({ type: 'error', text: 'Te rugăm să selectezi un fișier imagine valid (JPG sau PNG).' });
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setCurrentAvatarUrl(event.target.result as string);
        setActionNotice({ type: 'info', text: 'Imagine încărcată! Apasă pe butonul de mai jos pentru a o aplica pe WhatsApp.' });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleUpdateWhatsAppAvatar = async () => {
    if (!status.isConnected) {
      setActionNotice({ type: 'error', text: 'WhatsApp nu este conectat încă. Scanează codul QR sau folosește codul de asociere în tabul Conectare.' });
      return;
    }
    setUpdatingAvatar(true);
    setActionNotice(null);
    try {
      const res = await fetch('/api/whatsapp/update-avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarUrl: currentAvatarUrl }),
      });
      const data = await res.json();
      if (data.success) {
        setActionNotice({ type: 'success', text: '✅ Imaginea de profil a fost actualizată cu succes pe contul tău WhatsApp!' });
        await fetchStatus();
      } else {
        setActionNotice({ type: 'error', text: `❌ ${data.error || 'Nu s-a putut actualiza imaginea de profil.'}` });
      }
    } catch (e: any) {
      setActionNotice({ type: 'error', text: '❌ Eroare la comunicarea cu serverul.' });
    } finally {
      setUpdatingAvatar(false);
    }
  };

  const handleTriggerAutoAvatar = async () => {
    if (!status.isConnected) {
      setActionNotice({ type: 'error', text: 'WhatsApp nu este conectat.' });
      return;
    }
    setUpdatingAvatar(true);
    setActionNotice({ type: 'info', text: 'Se caută și se schimbă imaginea conform temei...' });
    try {
      const res = await fetch('/api/whatsapp/trigger-auto-avatar', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setActionNotice({ type: 'success', text: '✅ Imaginea a fost schimbată cu succes conform temei tale!' });
        if (data.url) setCurrentAvatarUrl(data.url);
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
        <div className="max-w-md w-full space-y-8 bg-slate-900/50 p-10 rounded-3xl border border-slate-800 backdrop-blur-xl shadow-2xl text-center">
          <div className="space-y-3">
            <div className="w-20 h-20 bg-emerald-600 rounded-3xl mx-auto flex items-center justify-center shadow-2xl shadow-emerald-600/30">
              <Lock className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight">WhatsOmni AI</h1>
            <p className="text-slate-400 text-sm">
              Asistentul tău WhatsApp 24/7 cu inteligență artificială avansată și stocare securizată Cloud SQL.
            </p>
          </div>

          <div className="py-6 space-y-4">
            <div className="flex items-center gap-3 p-4 bg-slate-950/50 rounded-2xl border border-slate-800/80 text-left">
              <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center shrink-0">
                <Database className="w-5 h-5" />
              </div>
              <div className="text-xs">
                <div className="font-bold text-white">Cloud SQL Permanent</div>
                <div className="text-slate-500">Toate mesajele sunt salvate securizat.</div>
              </div>
            </div>

            <div className="flex items-center gap-3 p-4 bg-slate-950/50 rounded-2xl border border-slate-800/80 text-left">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                <Cpu className="w-5 h-5" />
              </div>
              <div className="text-xs">
                <div className="font-bold text-white">Multi-AI Ensemble</div>
                <div className="text-slate-500">Gemini 3.8 Flash &amp; Lite active.</div>
              </div>
            </div>
          </div>

          <button
            onClick={handleLogin}
            className="w-full py-4 bg-white hover:bg-slate-100 text-slate-950 font-bold rounded-2xl transition-all flex items-center justify-center gap-3 shadow-xl hover:scale-[1.02] active:scale-95 cursor-pointer"
          >
            <LogIn className="w-5 h-5" />
            <span>Conectare cu Google</span>
          </button>

          <p className="text-[10px] text-slate-500 pt-4 uppercase tracking-widest font-bold">
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
              <div className="text-[11px] font-bold text-white leading-none">{user.displayName}</div>
              <div className="text-[9px] text-slate-500 mt-0.5">{user.email}</div>
            </div>
            <img src={user.photoURL || ''} alt="" className="w-8 h-8 rounded-full border border-slate-700" />
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
                        <div className="bg-slate-900 p-6 rounded-2xl border-2 border-emerald-500/40 text-center space-y-3 shadow-2xl">
                          <span className="text-[11px] text-slate-400 font-medium">Codul tău de asociere WhatsApp:</span>
                          <div className="font-mono text-3xl sm:text-4xl font-extrabold text-emerald-400 tracking-widest py-2 bg-slate-950 rounded-xl border border-slate-800">
                            {status.pairingCode}
                          </div>
                          
                          <button
                            onClick={copyPairingCodeToClipboard}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-2 mx-auto cursor-pointer transition-colors"
                          >
                            {copiedCode ? <CheckCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                            <span>{copiedCode ? 'Copiat!' : 'Copiază Codul'}</span>
                          </button>
                          
                          <p className="text-[11px] text-slate-400">
                            Tastează acest cod pe telefon când ești solicitat în WhatsApp!
                          </p>
                        </div>
                      ) : (
                        <form onSubmit={handleRequestPairingCode} className="space-y-4">
                          <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-300">
                              Introdu numărul tău de WhatsApp (cu prefix de țară):
                            </label>
                            <input 
                              type="text"
                              value={phoneNumberInput}
                              onChange={(e) => setPhoneNumberInput(e.target.value)}
                              placeholder="ex: 40712345678 (pentru România)"
                              className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-sm font-mono text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                            <p className="text-[10px] text-slate-400">
                              * Fără simbolul "+", spații sau cratime (ex: 407XXXXXXXX pentru România).
                            </p>
                          </div>

                          <button 
                            type="submit"
                            disabled={loading || !phoneNumberInput.trim()}
                            className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
                          >
                            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                            <span>Generează Codul de Asociere (8 caractere)</span>
                          </button>
                        </form>
                      )}

                      <div className="pt-2 border-t border-slate-800 flex justify-between items-center">
                        <button
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

        {/* ==================== TAB 2: PROFILE PICTURE CHANGER ==================== */}
        {activeTab === 'avatar' && (
          <div className="bg-slate-900 rounded-2xl p-8 border border-slate-800 shadow-xl space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-400" />
                  <span>Poze Pinterest - Profil WhatsApp</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Imagini preluate direct de pe Pinterest (maxim 5). Selectează orice poză de mai jos pentru a o seta pe contul tău WhatsApp.
                </p>
              </div>

              <button 
                onClick={loadPinterestGallery}
                disabled={generatingAvatar}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/20 cursor-pointer transition-all active:scale-95 shrink-0"
              >
                <RefreshCw className={`w-4 h-4 ${generatingAvatar ? 'animate-spin' : ''}`} />
                <span>Generează / Încarcă Alte Imagini</span>
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
              
              {/* Preview and Apply Section */}
              <div className="flex flex-col items-center justify-center p-6 bg-slate-950 rounded-2xl border border-slate-800 space-y-4 text-center">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Previzualizare Poză Selectată</span>
                
                <div className="relative">
                  <img 
                    src={currentAvatarUrl} 
                    alt="Avatar WhatsApp" 
                    className="w-52 h-52 rounded-full object-cover shadow-2xl border-4 border-emerald-500/40" 
                    referrerPolicy="no-referrer"
                  />
                  {updatingAvatar && (
                    <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm rounded-full flex flex-col items-center justify-center text-white text-xs gap-2">
                      <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
                      <span>Se aplică pe WhatsApp...</span>
                    </div>
                  )}
                </div>

                <button 
                  onClick={handleUpdateWhatsAppAvatar}
                  disabled={updatingAvatar || !status.isConnected}
                  className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                >
                  {updatingAvatar ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>{status.isConnected ? 'Aplică pe WhatsApp Acum' : 'Conectează WhatsApp Mai Întâi'}</span>
                </button>

                {!status.isConnected && (
                  <p className="text-[11px] text-amber-400">
                    * Conectează mai întâi contul WhatsApp în tabul "Conectare".
                  </p>
                )}

                {/* Upload local file */}
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileUpload} 
                  accept="image/png, image/jpeg, image/jpg, image/webp" 
                  className="hidden" 
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Upload className="w-4 h-4 text-emerald-400" />
                  <span>Încarcă Poză din Telefon / PC</span>
                </button>

                {/* Instant Next Image in Batch Trigger Button with Live 5-Min Auto-Timer */}
                <button
                  type="button"
                  onClick={() => {
                    handleTriggerAutoAvatar();
                    setAutoTimerSeconds(300); // Reset timer on manual click
                  }}
                  disabled={updatingAvatar || !status.isConnected}
                  className="w-full py-3 bg-purple-950/80 hover:bg-purple-900 border border-purple-700 disabled:opacity-50 text-purple-200 text-xs font-bold rounded-xl transition-all flex flex-col items-center justify-center gap-1 cursor-pointer active:scale-95 shadow-lg"
                >
                  <div className="flex items-center gap-2">
                    <RefreshCw className={`w-4 h-4 text-purple-400 ${updatingAvatar ? 'animate-spin' : ''}`} />
                    <span>Schimbă Instant cu Următoarea Poză din Lot</span>
                  </div>
                  <span className="text-[10px] text-purple-300 font-mono font-semibold flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    Apasă automat la fiecare 5 min (Următoarea în: {formatCountdown(autoTimerSeconds)})
                  </span>
                </button>
              </div>

              {/* Pinterest 5-Image Gallery Grid & Auto Rotator */}
              <div className="lg:col-span-2 space-y-6">
                
                {/* 5-Image Pinterest Display */}
                <div className="p-5 bg-slate-950 rounded-2xl border border-slate-800 space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                      <Image className="w-4 h-4 text-emerald-400" />
                      <span>Galerie Imagini Pinterest (Max. 5 Imagini)</span>
                    </label>
                    <span className="text-[10px] text-slate-500">Click pe imagine pentru previzualizare</span>
                  </div>

                  {generatingAvatar ? (
                    <div className="py-12 flex flex-col items-center justify-center text-slate-400 text-xs gap-3">
                      <RefreshCw className="w-8 h-8 animate-spin text-emerald-400" />
                      <span>Se descarcă 5 poze noi de pe Pinterest...</span>
                    </div>
                  ) : searchResults.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                      {searchResults.slice(0, 5).map((url, i) => (
                        <button 
                          key={i}
                          onClick={() => setCurrentAvatarUrl(url)}
                          className={`rounded-2xl overflow-hidden aspect-square border-2 transition-all cursor-pointer relative group ${
                            currentAvatarUrl === url ? 'border-emerald-500 ring-4 ring-emerald-500/20 scale-105' : 'border-slate-800 hover:border-slate-600'
                          }`}
                        >
                          <img 
                            src={url} 
                            alt={`Pinterest ${i + 1}`} 
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" 
                            referrerPolicy="no-referrer"
                          />
                          {currentAvatarUrl === url && (
                            <div className="absolute inset-0 bg-emerald-950/40 flex items-center justify-center">
                              <Check className="w-6 h-6 text-emerald-400 drop-shadow" />
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="p-8 text-center text-xs text-slate-400 space-y-3">
                      <p>Se descarcă pozele...</p>
                      <button
                        onClick={loadPinterestGallery}
                        className="px-4 py-2 bg-emerald-600 text-white font-bold rounded-xl text-xs"
                      >
                        Încarcă Imagini
                      </button>
                    </div>
                  )}

                  <div className="pt-2 flex justify-end">
                    <button
                      onClick={loadPinterestGallery}
                      disabled={generatingAvatar}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-emerald-400 border border-slate-700 text-xs font-semibold rounded-xl transition-all flex items-center gap-2 cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${generatingAvatar ? 'animate-spin' : ''}`} />
                      <span>Încarcă Alte 5 Imagini Pinterest</span>
                    </button>
                  </div>
                </div>

                {/* Auto Avatar 24/7 Settings */}
                <div className="p-5 bg-emerald-950/20 rounded-2xl border border-emerald-900/30 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                        <RefreshCw className={`w-4 h-4 ${aiSettings.autoAvatarEnabled ? 'animate-spin' : ''}`} />
                        <span>Rotire Automată Poză WhatsApp 24/7</span>
                      </label>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Asistentul schimbă automat poza de profil pe WhatsApp la fiecare X minute.
                      </p>
                    </div>

                    <button
                      onClick={() => handleSaveAISettings({ autoAvatarEnabled: !aiSettings.autoAvatarEnabled })}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none cursor-pointer ${aiSettings.autoAvatarEnabled ? 'bg-emerald-600' : 'bg-slate-700'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${aiSettings.autoAvatarEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Interval rotire (minute):</label>
                      <input 
                        type="number"
                        min="1"
                        value={aiSettings.autoAvatarIntervalMinutes}
                        onChange={(e) => setAiSettings(prev => ({ ...prev, autoAvatarIntervalMinutes: Math.max(1, parseInt(e.target.value) || 1) }))}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Cuvânt / Temă de căutare Pinterest:</label>
                      <input 
                        type="text"
                        value={aiSettings.autoAvatarQuery}
                        onChange={(e) => setAiSettings(prev => ({ ...prev, autoAvatarQuery: e.target.value }))}
                        placeholder="ex: scp, mașini, peisaje..."
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
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-md shadow-emerald-600/20"
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
              <div className="flex items-center justify-between text-xs font-bold text-slate-400">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-emerald-400" />
                  <span>Istoric Mesaje Cloud SQL Permanent ({persistentMessages.length})</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span className="text-[10px] text-slate-500">Stocat 24/7</span>
                  </div>
                  <button 
                    onClick={fetchPersistentMessages}
                    className="p-1 hover:bg-slate-800 rounded transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
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
                  {persistentMessages.map((msg: PersistentMessage) => {
                    const isAi = msg.sender === 'ai';
                    return (
                      <div 
                        key={msg.id} 
                        className={`p-4 rounded-2xl border transition-all hover:bg-slate-900/80 ${
                          isAi ? 'bg-purple-950/20 border-purple-800/30' : 'bg-slate-950 border-slate-800/80'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4 mb-2">
                          <div className="flex items-center gap-2">
                            <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${isAi ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                              {isAi ? <Bot className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
                            </div>
                            <div>
                              <span className={`text-[11px] font-bold ${isAi ? 'text-purple-400' : 'text-emerald-400'}`}>
                                {msg.senderName || msg.sender}
                              </span>
                              {msg.modelUsed && (
                                <span className="ml-2 px-1.5 py-0.5 rounded bg-slate-800 text-[9px] text-slate-500 font-bold border border-slate-700">
                                  {msg.modelUsed}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="text-[9px] text-slate-500 font-mono whitespace-nowrap">
                            {new Date(msg.createdAt).toLocaleString('ro-RO', { 
                              day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' 
                            })}
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed pl-8">
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

      </main>
    </div>
  );
}
