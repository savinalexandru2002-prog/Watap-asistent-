import React, { useState, useEffect } from 'react';
import { 
  QrCode, MessageCircle, Instagram, Facebook, Linkedin, Twitter, Video, Send, 
  Sparkles, RefreshCw, CheckCircle2, AlertCircle, Smartphone, ShieldCheck, 
  Settings, User, Layers, ArrowRight, Check, Power, LogOut, Terminal, Bot,
  HelpCircle, ChevronRight, Zap, Globe
} from 'lucide-react';

interface WhatsAppState {
  status: 'DISCONNECTED' | 'SCANNING_QR' | 'CONNECTED';
  qrCodeUrl: string | null;
  phoneNumber: string | null;
  deviceName: string | null;
  connectedAt: string | null;
  batteryLevel: number;
}

interface NetworkAccount {
  id: string;
  name: string;
  icon: string;
  connected: boolean;
  username: string;
  currentAvatar: string;
  lastSynced: string | null;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'whatsapp' | 'avatar' | 'networks'>('dashboard');
  
  const [whatsapp, setWhatsapp] = useState<WhatsAppState>({
    status: 'DISCONNECTED',
    qrCodeUrl: null,
    phoneNumber: null,
    deviceName: null,
    connectedAt: null,
    batteryLevel: 98,
  });
  
  const [networks, setNetworks] = useState<NetworkAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  // Avatar generator state
  const [avatarPrompt, setAvatarPrompt] = useState('Professional executive portrait');
  const [avatarStyle, setAvatarStyle] = useState('executive');
  const [currentAvatarUrl, setCurrentAvatarUrl] = useState('https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80');
  const [generatingAvatar, setGeneratingAvatar] = useState(false);

  // WhatsApp Chats state
  const [chats, setChats] = useState<Array<any>>([]);
  const [activeChatId, setActiveChatId] = useState<string>('1');
  const [messageInput, setMessageInput] = useState<string>('');
  const [chatLoading, setChatLoading] = useState<boolean>(false);

  useEffect(() => {
    fetchWhatsAppStatus();
    fetchNetworks();
    fetchChats();
    handleGenerateQr();
  }, []);

  const fetchWhatsAppStatus = async () => {
    try {
      const res = await fetch('/api/whatsapp/status');
      const data = await res.json();
      setWhatsapp(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchNetworks = async () => {
    try {
      const res = await fetch('/api/networks');
      const data = await res.json();
      setNetworks(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchChats = async () => {
    try {
      const res = await fetch('/api/whatsapp/chats');
      const data = await res.json();
      setChats(data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleGenerateQr = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/whatsapp/generate-qr', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setWhatsapp(data.session);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleActivateSession = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/whatsapp/connect-session', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setWhatsapp(data.session);
        await fetchNetworks();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/whatsapp/disconnect', { method: 'POST' });
      const data = await res.json();
      setWhatsapp(data);
      await fetchNetworks();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleNetwork = async (id: string, connected: boolean) => {
    try {
      const res = await fetch('/api/networks/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, connected: !connected }),
      });
      const data = await res.json();
      setNetworks(data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleGenerateAvatar = async () => {
    setGeneratingAvatar(true);
    try {
      const res = await fetch('/api/ai/generate-avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: avatarPrompt, style: avatarStyle }),
      });
      const data = await res.json();
      if (data.success && data.avatarUrl) {
        setCurrentAvatarUrl(data.avatarUrl);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setGeneratingAvatar(false);
    }
  };

  const handleSyncAll = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/networks/sync-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarUrl: currentAvatarUrl }),
      });
      const data = await res.json();
      if (data.success) {
        setNetworks(data.networks);
        setSyncResult(`Sincronizat cu succes pe ${data.syncedCount} rețele sociale! (${data.timestamp})`);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSyncing(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || chatLoading) return;

    const text = messageInput;
    setMessageInput('');
    setChatLoading(true);

    try {
      const res = await fetch('/api/whatsapp/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: activeChatId, text }),
      });
      const data = await res.json();
      if (data.success) {
        setChats(data.chats);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setChatLoading(false);
    }
  };

  const renderNetworkIcon = (iconName: string) => {
    switch(iconName) {
      case 'MessageCircle': return <MessageCircle className="w-5 h-5 text-emerald-600" />;
      case 'Instagram': return <Instagram className="w-5 h-5 text-pink-600" />;
      case 'Facebook': return <Facebook className="w-5 h-5 text-blue-600" />;
      case 'Linkedin': return <Linkedin className="w-5 h-5 text-sky-600" />;
      case 'Twitter': return <Twitter className="w-5 h-5 text-slate-800 dark:text-slate-100" />;
      case 'Video': return <Video className="w-5 h-5 text-neutral-900 dark:text-neutral-100" />;
      case 'Send': return <Send className="w-5 h-5 text-blue-500" />;
      default: return <Globe className="w-5 h-5 text-slate-600" />;
    }
  };

  const connectedCount = networks.filter(n => n.connected).length;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans selection:bg-emerald-500 selection:text-white">
      
      {/* 3-ZONE TOP BAR CONTRACT */}
      <header className="sticky top-0 z-50 flex items-center justify-between gap-8 px-8 py-4 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-md shadow-emerald-600/20">
            <MessageCircle className="w-6 h-6" />
          </div>
          <div>
            <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
              WhatsOmni AI
            </span>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              WhatsApp & Social Sync
            </div>
          </div>
        </div>

        <nav className="hidden md:flex items-center gap-2 text-sm font-medium">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`px-4 py-2 rounded-lg transition-colors whitespace-nowrap shrink-0 ${activeTab === 'dashboard' ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
          >
            Panou Principal
          </button>
          <button 
            onClick={() => setActiveTab('whatsapp')}
            className={`px-4 py-2 rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-2 ${activeTab === 'whatsapp' ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
          >
            <span>Conexiune WhatsApp Web</span>
            {whatsapp.status === 'CONNECTED' && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>}
          </button>
          <button 
            onClick={() => setActiveTab('avatar')}
            className={`px-4 py-2 rounded-lg transition-colors whitespace-nowrap shrink-0 ${activeTab === 'avatar' ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
          >
            Studio Avatar AI
          </button>
          <button 
            onClick={() => setActiveTab('networks')}
            className={`px-4 py-2 rounded-lg transition-colors whitespace-nowrap shrink-0 ${activeTab === 'networks' ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
          >
            Rețele Sociale ({connectedCount})
          </button>
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <button 
            onClick={handleSyncAll}
            disabled={syncing || whatsapp.status !== 'CONNECTED'}
            className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors rounded-lg shadow-sm disabled:opacity-50 flex items-center gap-2 whitespace-nowrap"
          >
            {syncing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            <span>Sincronizează Tot</span>
          </button>
        </div>
      </header>

      {/* MOBILE NAV */}
      <div className="flex md:hidden overflow-x-auto px-4 py-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 gap-2 shrink-0">
        <button onClick={() => setActiveTab('dashboard')} className={`px-3 py-1.5 text-xs rounded-md whitespace-nowrap ${activeTab === 'dashboard' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-semibold' : 'text-slate-600 dark:text-slate-400'}`}>Panou</button>
        <button onClick={() => setActiveTab('whatsapp')} className={`px-3 py-1.5 text-xs rounded-md whitespace-nowrap ${activeTab === 'whatsapp' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-semibold' : 'text-slate-600 dark:text-slate-400'}`}>WhatsApp</button>
        <button onClick={() => setActiveTab('avatar')} className={`px-3 py-1.5 text-xs rounded-md whitespace-nowrap ${activeTab === 'avatar' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-semibold' : 'text-slate-600 dark:text-slate-400'}`}>Avatar</button>
        <button onClick={() => setActiveTab('networks')} className={`px-3 py-1.5 text-xs rounded-md whitespace-nowrap ${activeTab === 'networks' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-semibold' : 'text-slate-600 dark:text-slate-400'}`}>Rețele</button>
      </div>

      <main className="max-w-7xl mx-auto px-6 py-8">
        
        {syncResult && (
          <div className="mb-6 p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center justify-between text-emerald-800 dark:text-emerald-300">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span className="text-sm font-medium">{syncResult}</span>
            </div>
            <button onClick={() => setSyncResult(null)} className="text-xs text-emerald-600 font-semibold hover:underline">Închide</button>
          </div>
        )}

        {/* ==================== DASHBOARD ==================== */}
        {activeTab === 'dashboard' && (
          <div className="space-y-8">
            <div className="relative overflow-hidden bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 rounded-2xl p-8 text-white shadow-xl border border-slate-800">
              <div className="absolute top-0 right-0 p-8 opacity-15 pointer-events-none">
                <MessageCircle className="w-64 h-64 text-emerald-400" />
              </div>
              <div className="max-w-2xl relative z-10 space-y-4">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
                  <Zap className="w-3.5 h-3.5" />
                  <span>Sistem WhatsApp Web & Sincronizare Rețele</span>
                </div>
                <h1 className="text-3xl lg:text-4xl font-bold tracking-tight text-white">
                  Asistent WhatsApp & Profile Sync
                </h1>
                <p className="text-slate-300 text-sm leading-relaxed">
                  Conectează-te direct prin cod QR la WhatsApp Web. Asistentul tău AI inteligent răspunde <strong>exclusiv când @Alexandru este menționat în chat</strong>, iar imaginile de profil se sincronizează automat pe toate rețelele.
                </p>
                <div className="flex flex-wrap gap-4 pt-2">
                  <button 
                    onClick={() => setActiveTab('whatsapp')}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-emerald-600/30 transition-all flex items-center gap-2"
                  >
                    <QrCode className="w-4 h-4" />
                    <span>Conectare QR WhatsApp Web</span>
                  </button>
                  <button 
                    onClick={() => setActiveTab('avatar')}
                    className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white text-sm font-semibold rounded-xl border border-white/20 transition-all flex items-center gap-2"
                  >
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    <span>Studio Avatar AI</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-600">
                      <MessageCircle className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900 dark:text-white">WhatsApp Web</h3>
                      <p className="text-xs text-slate-500">Stare sesiune</p>
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${whatsapp.status === 'CONNECTED' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>
                    {whatsapp.status === 'CONNECTED' ? 'Conectat' : 'Pregătit QR'}
                  </span>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
                  <div>Sesiune QR: <strong className="text-emerald-600 dark:text-emerald-400">Generată Automat</strong></div>
                  <div>Asistent AI: <strong className="text-emerald-600 dark:text-emerald-400">Activ (@Alexandru)</strong></div>
                </div>
                <button 
                  onClick={() => setActiveTab('whatsapp')}
                  className="w-full py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1"
                >
                  <span>Scanează QR WhatsApp Web</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center text-blue-600">
                      <Layers className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900 dark:text-white">Rețele Sociale</h3>
                      <p className="text-xs text-slate-500">Sincronizate</p>
                    </div>
                  </div>
                  <span className="text-lg font-bold font-mono text-slate-900 dark:text-white">
                    {connectedCount} <span className="text-xs text-slate-400 font-normal">/ {networks.length}</span>
                  </span>
                </div>
                <div className="flex -space-x-2 overflow-hidden py-1">
                  {networks.filter(n => n.connected).map(net => (
                    <div key={net.id} className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800 border-2 border-white dark:border-slate-900 flex items-center justify-center text-xs font-semibold" title={net.name}>
                      {net.name[0]}
                    </div>
                  ))}
                </div>
                <button 
                  onClick={() => setActiveTab('networks')}
                  className="w-full py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1"
                >
                  <span>Configurează Rețelele</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <img src={currentAvatarUrl} alt="Avatar" className="w-10 h-10 rounded-xl object-cover" referrerPolicy="no-referrer" />
                    <div>
                      <h3 className="font-semibold text-slate-900 dark:text-white">Avatar Curent</h3>
                      <p className="text-xs text-slate-500">Gemini AI Studio</p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 text-xs font-semibold bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 rounded-md">
                    Pregătit
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 truncate">
                  {avatarPrompt}
                </p>
                <button 
                  onClick={() => setActiveTab('avatar')}
                  className="w-full py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1"
                >
                  <span>Studio Avatar AI</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ==================== WHATSAPP VIEW ==================== */}
        {activeTab === 'whatsapp' && (
          <div className="max-w-4xl mx-auto space-y-8">
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
              
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">Conexiune WhatsApp Web Oficială</h2>
                  <p className="text-xs text-slate-500 mt-1">Conectează-ți telefonul direct la WhatsApp Web oficial pentru pairing autentic.</p>
                </div>
                <span className={`px-3 py-1 text-xs font-semibold rounded-full flex items-center gap-1.5 ${whatsapp.status === 'CONNECTED' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'}`}>
                  <span className={`w-2 h-2 rounded-full ${whatsapp.status === 'CONNECTED' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></span>
                  {whatsapp.status === 'CONNECTED' ? 'WhatsApp Web Conectat' : 'Așteaptă Conectarea'}
                </span>
              </div>

              {whatsapp.status !== 'CONNECTED' ? (
                <div className="py-6 space-y-8">
                  
                  {/* Step by step official guide banner */}
                  <div className="p-6 bg-emerald-50/70 dark:bg-emerald-950/30 rounded-2xl border border-emerald-200 dark:border-emerald-800 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-md">
                        <Globe className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-sm text-slate-900 dark:text-white">Conectare Autentică WhatsApp Web</h3>
                        <p className="text-xs text-slate-600 dark:text-slate-400">Codul QR oficial pentru împerecherea dispozitivelor este generat exclusiv de serverele WhatsApp pe web.whatsapp.com</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                      <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                        <div className="text-emerald-600 dark:text-emerald-400 font-bold text-xs uppercase tracking-wider mb-1">Pasul 1</div>
                        <p className="text-xs text-slate-700 dark:text-slate-300 font-medium">Apasă pe butonul verde de mai jos pentru a deschide <strong>web.whatsapp.com</strong>.</p>
                      </div>
                      <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                        <div className="text-emerald-600 dark:text-emerald-400 font-bold text-xs uppercase tracking-wider mb-1">Pasul 2</div>
                        <p className="text-xs text-slate-700 dark:text-slate-300 font-medium">Pe telefon: <strong>WhatsApp &rarr; Dispozitive conectate &rarr; Conectează un dispozitiv</strong>.</p>
                      </div>
                      <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                        <div className="text-emerald-600 dark:text-emerald-400 font-bold text-xs uppercase tracking-wider mb-1">Pasul 3</div>
                        <p className="text-xs text-slate-700 dark:text-slate-300 font-medium">Scanează codul QR oficial afișat pe ecranul WhatsApp Web.</p>
                      </div>
                    </div>

                    <div className="pt-2 flex flex-col sm:flex-row gap-3">
                      <a 
                        href="https://web.whatsapp.com" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Globe className="w-4 h-4" />
                        <span>1. Deschide WhatsApp Web Oficial (web.whatsapp.com)</span>
                      </a>

                      <button 
                        onClick={handleActivateSession}
                        disabled={loading}
                        className="flex-1 py-3.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold rounded-xl shadow-md hover:bg-slate-800 dark:hover:bg-slate-100 transition-all flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        <span>2. Am scanat codul &rarr; Activează Asistentul WhatsOmni</span>
                      </button>
                    </div>
                  </div>

                  {/* Informative Rule Notice */}
                  <div className="p-4 bg-slate-100 dark:bg-slate-800/60 rounded-xl space-y-1.5 border border-slate-200 dark:border-slate-700/50">
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                      <Bot className="w-4 h-4 text-emerald-600" />
                      <span>Regulă Asistent WhatsApp (@Alexandru):</span>
                    </div>
                    <div className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                      Asistentul WhatsOmni răspunde <strong>exclusiv când mesajul conține mențiunea @Alexandru</strong>. În caz contrar, mesajele normale rămân private și neafectate.
                    </div>
                  </div>

                </div>
              ) : (
                <div className="space-y-6">
                  <div className="p-6 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 bg-emerald-600 text-white rounded-2xl flex items-center justify-center shadow-md">
                        <Smartphone className="w-7 h-7" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-slate-900 dark:text-white text-base">WhatsApp Web Conectat & Asistent Activ</h3>
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-400 font-mono mt-0.5">{whatsapp.phoneNumber}</p>
                        <p className="text-xs text-slate-500 mt-1">Asistentul AI răspunde <strong>doar când @Alexandru este menționat</strong>.</p>
                      </div>
                    </div>

                    <button 
                      onClick={handleDisconnect}
                      className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-950/50 dark:text-red-300 text-xs font-semibold rounded-xl transition-colors border border-red-200 dark:border-red-800 flex items-center gap-2"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Deconectare</span>
                    </button>
                  </div>

                  {/* Functional WhatsApp Chat Client */}
                  <div className="bg-slate-900 rounded-2xl border border-slate-800 shadow-xl overflow-hidden grid grid-cols-1 md:grid-cols-3 h-[480px]">
                    <div className="border-r border-slate-800 bg-slate-950/50 flex flex-col">
                      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Conversații WhatsApp</span>
                        <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-full text-[10px] font-semibold">Web Live</span>
                      </div>
                      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/50">
                        {chats.map(chat => {
                          const active = chat.id === activeChatId;
                          const lastMsg = chat.messages[chat.messages.length - 1];
                          return (
                            <div 
                              key={chat.id}
                              onClick={() => setActiveChatId(chat.id)}
                              className={`p-4 flex items-center gap-3 cursor-pointer transition-colors ${active ? 'bg-slate-800/80' : 'hover:bg-slate-900/60'}`}
                            >
                              <img src={chat.avatar} alt={chat.name} className="w-10 h-10 rounded-full object-cover shrink-0" referrerPolicy="no-referrer" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                  <h4 className="font-semibold text-xs text-white truncate">{chat.name}</h4>
                                  <span className="text-[10px] text-slate-500 font-mono">{lastMsg?.time}</span>
                                </div>
                                <p className="text-[11px] text-slate-400 truncate mt-0.5">{lastMsg?.text}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="md:col-span-2 flex flex-col bg-slate-900">
                      {(() => {
                        const currentChat = chats.find(c => c.id === activeChatId) || chats[0];
                        if (!currentChat) return <div className="flex-1 flex items-center justify-center text-slate-500 text-xs">Nicio conversație</div>;
                        return (
                          <>
                            <div className="px-6 py-3.5 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <img src={currentChat.avatar} alt={currentChat.name} className="w-9 h-9 rounded-full object-cover" referrerPolicy="no-referrer" />
                                <div>
                                  <h4 className="font-semibold text-xs text-white">{currentChat.name}</h4>
                                  <p className="text-[10px] text-slate-400 font-mono">{currentChat.phone} • Conectat prin WhatsApp Web</p>
                                </div>
                              </div>
                              <span className="text-[11px] text-emerald-400 font-medium">Criptat End-to-End</span>
                            </div>

                            <div className="flex-1 overflow-y-auto p-6 space-y-4">
                              <div className="text-center">
                                <span className="px-3 py-1 bg-slate-800 text-slate-400 text-[10px] rounded-full">
                                  🤖 Asistentul AI WhatsOmni răspunde doar când menționezi @Alexandru în chat
                                </span>
                              </div>
                              {currentChat.messages.map((msg: any, idx: number) => {
                                const isUser = msg.sender === 'user';
                                const isAi = msg.sender === 'ai';
                                return (
                                  <div key={idx} className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-md p-3.5 rounded-2xl text-xs leading-relaxed ${isUser ? 'bg-emerald-600 text-white rounded-br-none' : isAi ? 'bg-purple-900/60 border border-purple-700/50 text-purple-100 rounded-bl-none' : 'bg-slate-800 text-slate-200 rounded-bl-none'}`}>
                                      {isAi && <div className="text-[10px] font-bold text-purple-300 mb-1">🤖 WhatsOmni AI (mențiune @Alexandru):</div>}
                                      {msg.text}
                                      <div className={`text-[9px] mt-1 text-right ${isUser ? 'text-emerald-200' : 'text-slate-400'}`}>{msg.time}</div>
                                    </div>
                                  </div>
                                );
                              })}
                              {chatLoading && (
                                <div className="flex gap-2 items-center text-slate-400 text-xs italic">
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-500" />
                                  <span>Asistentul procesează...</span>
                                </div>
                              )}
                            </div>

                            <form onSubmit={handleSendMessage} className="p-3.5 bg-slate-950/90 border-t border-slate-800 space-y-2">
                              <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
                                <span className="font-mono text-[10px] text-slate-500">WhatsApp Web Messenger</span>
                                <button
                                  type="button"
                                  onClick={() => setMessageInput(prev => prev.includes('@Alexandru') ? prev : `${prev ? prev.trim() + ' ' : ''}@Alexandru `)}
                                  className="px-2.5 py-1 bg-purple-900/40 hover:bg-purple-900/60 border border-purple-500/40 text-purple-300 rounded-lg text-[10px] font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                                >
                                  <Sparkles className="w-3 h-3 text-purple-400" />
                                  <span>Adaugă @Alexandru</span>
                                </button>
                              </div>
                              <div className="flex gap-2">
                                <input 
                                  type="text"
                                  value={messageInput}
                                  onChange={(e) => setMessageInput(e.target.value)}
                                  placeholder="Scrie un mesaj (menționează @Alexandru pentru asistent)..."
                                  className="flex-1 px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                />
                                <button 
                                  type="submit"
                                  disabled={chatLoading || !messageInput.trim()}
                                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-md transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                                >
                                  <span>Trimite</span>
                                  <Send className="w-4 h-4" />
                                </button>
                              </div>
                            </form>
                          </>
                        );
                      })()}
                    </div>
                  </div>

                </div>
              )}

            </div>
          </div>
        )}

        {/* ==================== AVATAR STUDIO ==================== */}
        {activeTab === 'avatar' && (
          <div className="max-w-5xl mx-auto space-y-8">
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 border border-slate-200 dark:border-slate-800 shadow-sm space-y-8">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Sparkles className="w-6 h-6 text-amber-500" />
                    <span>Studio Avatar AI (Gemini)</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">Creează portrete profesionale și sincronizează-le instant pe toate rețelele sociale.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                <div className="space-y-4">
                  <div className="p-6 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col items-center text-center space-y-4">
                    <div className="relative group">
                      <img src={currentAvatarUrl} alt="Avatar AI" className="w-48 h-48 rounded-2xl object-cover shadow-lg border-2 border-slate-200 dark:border-slate-700" referrerPolicy="no-referrer" />
                      {generatingAvatar && (
                        <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm rounded-2xl flex items-center justify-center text-white font-semibold text-xs gap-2">
                          <RefreshCw className="w-5 h-5 animate-spin text-emerald-400" />
                          <span>Se generează...</span>
                        </div>
                      )}
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-900 dark:text-white text-sm">Avatar Activ</h4>
                      <p className="text-xs text-slate-500 mt-1">Pregătit pentru sincronizare</p>
                    </div>
                    <button 
                      onClick={handleSyncAll}
                      disabled={syncing}
                      className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>Sincronizează Acest Avatar</span>
                    </button>
                  </div>
                </div>

                <div className="lg:col-span-2 space-y-6">
                  <div className="space-y-3">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Stiluri Predefinite</label>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {[
                        { id: 'executive', label: 'Executive Business', desc: 'Portret corporatist elegant' },
                        { id: 'cyberpunk', label: 'Cyberpunk Neon', desc: 'Futuristic și vibrant' },
                        { id: 'minimalist', label: 'Minimalist Vector', desc: 'Design geometric flat' },
                      ].map(style => (
                        <button
                          key={style.id}
                          onClick={() => {
                            setAvatarStyle(style.id);
                            setAvatarPrompt(style.label + ' professional portrait');
                          }}
                          className={`p-3 rounded-xl border text-left transition-all ${avatarStyle === style.id ? 'border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/30 text-slate-900 dark:text-white font-semibold shadow-sm' : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-600 dark:text-slate-400'}`}
                        >
                          <div className="text-xs font-bold">{style.label}</div>
                          <div className="text-[10px] text-slate-500 mt-0.5">{style.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Prompt / Descriere Personalizată</label>
                    <textarea 
                      value={avatarPrompt}
                      onChange={(e) => setAvatarPrompt(e.target.value)}
                      rows={3}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <button 
                    onClick={handleGenerateAvatar}
                    disabled={generatingAvatar}
                    className="w-full py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold rounded-xl hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors flex items-center justify-center gap-2 shadow-sm"
                  >
                    {generatingAvatar ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-amber-400" />}
                    <span>Generează Avatar cu Gemini AI</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== NETWORKS HUB ==================== */}
        {activeTab === 'networks' && (
          <div className="max-w-5xl mx-auto space-y-8">
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">Rețele Sociale Conectate</h2>
                  <p className="text-xs text-slate-500 mt-1">Activează sau dezactivează rețelele pentru sincronizarea automată a avatarului.</p>
                </div>
                <button 
                  onClick={handleSyncAll}
                  disabled={syncing || connectedCount === 0}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-sm transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {syncing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  <span>Sincronizează Toate Cele {connectedCount} Rețele</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {networks.map(net => (
                  <div key={net.id} className={`p-5 rounded-2xl border transition-all flex items-center justify-between ${net.connected ? 'border-emerald-500/30 bg-emerald-50/30 dark:bg-emerald-950/20' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 opacity-75'}`}>
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        <img src={net.currentAvatar} alt={net.name} className="w-12 h-12 rounded-xl object-cover border border-slate-200 dark:border-slate-700" referrerPolicy="no-referrer" />
                        <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-white dark:bg-slate-900 shadow border border-slate-200 dark:border-slate-800 flex items-center justify-center">
                          {renderNetworkIcon(net.icon)}
                        </div>
                      </div>
                      <div>
                        <h4 className="font-semibold text-sm text-slate-900 dark:text-white">{net.name}</h4>
                        <p className="text-xs text-slate-500 font-mono mt-0.5">{net.username}</p>
                        <p className="text-[10px] text-slate-400 mt-1">Ultima sincronizare: {net.lastSynced || 'Niciodată'}</p>
                      </div>
                    </div>

                    <button
                      onClick={() => handleToggleNetwork(net.id, net.connected)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${net.connected ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-700'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${net.connected ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
