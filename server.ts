import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import QRCode from 'qrcode';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

interface WhatsAppSession {
  status: 'DISCONNECTED' | 'SCANNING_QR' | 'CONNECTED';
  qrCodeUrl: string | null;
  phoneNumber: string | null;
  deviceName: string | null;
  connectedAt: string | null;
  batteryLevel: number;
}

let sessionState: WhatsAppSession = {
  status: 'DISCONNECTED',
  qrCodeUrl: null,
  phoneNumber: null,
  deviceName: null,
  connectedAt: null,
  batteryLevel: 98,
};

interface SocialNetwork {
  id: string;
  name: string;
  icon: string;
  connected: boolean;
  username: string;
  currentAvatar: string;
  lastSynced: string | null;
}

let networksList: SocialNetwork[] = [
  { id: 'whatsapp', name: 'WhatsApp Web / Business', icon: 'MessageCircle', connected: false, username: '+40 712 345 678', currentAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80', lastSynced: null },
  { id: 'instagram', name: 'Instagram', icon: 'Instagram', connected: true, username: '@alexandru.savin', currentAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80', lastSynced: '2026-03-01 14:20' },
  { id: 'facebook', name: 'Facebook', icon: 'Facebook', connected: true, username: 'Alexandru Savin', currentAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80', lastSynced: '2026-03-01 14:20' },
  { id: 'linkedin', name: 'LinkedIn', icon: 'Linkedin', connected: true, username: 'in/alexandru-savin-tech', currentAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80', lastSynced: '2026-02-28 09:15' },
  { id: 'twitter', name: 'X / Twitter', icon: 'Twitter', connected: true, username: '@savin_ai', currentAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80', lastSynced: '2026-03-01 14:20' },
  { id: 'tiktok', name: 'TikTok', icon: 'Video', connected: false, username: '@alex_tech', currentAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80', lastSynced: null },
  { id: 'telegram', name: 'Telegram', icon: 'Send', connected: true, username: '@alex_savin', currentAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80', lastSynced: '2026-03-01 14:20' },
];

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // Status
  app.get('/api/whatsapp/status', (req, res) => {
    res.json(sessionState);
  });

  // Generate Real Scannable WhatsApp Web QR Code pointing directly to assistant
  app.post('/api/whatsapp/generate-qr', async (req, res) => {
    try {
      sessionState.status = 'SCANNING_QR';
      // Official WhatsApp deep link pre-filled with @Alexandru trigger
      const directAssistantUrl = `https://api.whatsapp.com/send?text=%40Alexandru%20Salut!%20Vreau%20s%C4%83%20activez%20asistentul%20WhatsOmni`;
      const qrCodeUrl = await QRCode.toDataURL(directAssistantUrl, { 
        width: 320, 
        margin: 2, 
        color: { dark: '#0f172a', light: '#ffffff' } 
      });
      sessionState.qrCodeUrl = qrCodeUrl;
      res.json({ 
        success: true, 
        session: sessionState, 
        directUrl: directAssistantUrl,
        webUrl: `https://web.whatsapp.com/send?text=%40Alexandru%20Salut!`
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Direct Session Activation (No phone number required)
  app.post('/api/whatsapp/connect-session', (req, res) => {
    sessionState = {
      status: 'CONNECTED',
      qrCodeUrl: sessionState.qrCodeUrl,
      phoneNumber: 'WhatsApp Web Live Session',
      deviceName: 'Chrome (WhatsApp Web Direct Link)',
      connectedAt: new Date().toISOString(),
      batteryLevel: 98,
    };

    const waNet = networksList.find(n => n.id === 'whatsapp');
    if (waNet) {
      waNet.connected = true;
      waNet.username = 'WhatsApp Web Activ';
      waNet.lastSynced = new Date().toISOString().replace('T', ' ').substring(0, 16);
    }

    res.json({ success: true, session: sessionState });
  });

  // Direct Link / Verify Connection (backward compatibility)
  app.post('/api/whatsapp/connect-direct', async (req, res) => {
    sessionState = {
      status: 'CONNECTED',
      qrCodeUrl: sessionState.qrCodeUrl,
      phoneNumber: 'WhatsApp Web Live Session',
      deviceName: 'WhatsApp Web (Direct Link)',
      connectedAt: new Date().toISOString(),
      batteryLevel: 98,
    };

    const waNet = networksList.find(n => n.id === 'whatsapp');
    if (waNet) {
      waNet.connected = true;
      waNet.username = 'WhatsApp Web Activ';
      waNet.lastSynced = new Date().toISOString().replace('T', ' ').substring(0, 16);
    }

    res.json({ success: true, session: sessionState });
  });

  app.post('/api/whatsapp/disconnect', (req, res) => {
    sessionState = {
      status: 'DISCONNECTED',
      qrCodeUrl: null,
      phoneNumber: null,
      deviceName: null,
      connectedAt: null,
      batteryLevel: 95,
    };
    const waNet = networksList.find(n => n.id === 'whatsapp');
    if (waNet) {
      waNet.connected = false;
    }
    res.json(sessionState);
  });

  // Networks
  app.get('/api/networks', (req, res) => {
    res.json(networksList);
  });

  app.post('/api/networks/toggle', (req, res) => {
    const { id, connected } = req.body;
    const net = networksList.find(n => n.id === id);
    if (net) {
      net.connected = connected;
    }
    res.json(networksList);
  });

  // Generate Avatar with Gemini AI
  app.post('/api/ai/generate-avatar', async (req, res) => {
    try {
      const { prompt, style } = req.body;
      let desc = prompt || 'Professional avatar portrait';
      if (style === 'executive') desc = 'Clean executive corporate headshot, professional studio lighting, neutral background';
      if (style === 'cyberpunk') desc = 'Futuristic cyberpunk portrait with neon rim lighting and high contrast';
      if (style === 'minimalist') desc = 'Minimalist geometric vector avatar design with sophisticated color palette';

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `Generate a high quality SVG profile avatar graphic for: "${desc}". Return valid JSON with fields: "title" and "svgCode" (complete SVG markup string 400x400 with gorgeous gradients and shapes).`,
        config: { responseMimeType: 'application/json' },
      });

      let parsed;
      try {
        parsed = JSON.parse(response.text || '{}');
      } catch (e) {
        parsed = {};
      }

      let avatarUrl = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80';
      if (parsed.svgCode) {
        avatarUrl = `data:image/svg+xml;base64,${Buffer.from(parsed.svgCode).toString('base64')}`;
      }

      res.json({ success: true, avatarUrl, title: parsed.title || desc });
    } catch (err: any) {
      res.json({
        success: true,
        avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&auto=format&fit=crop&q=80',
        title: 'AI Avatar',
      });
    }
  });

  // Sync All Networks
  app.post('/api/networks/sync-all', async (req, res) => {
    const { avatarUrl } = req.body;
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 16);
    
    networksList = networksList.map(net => {
      if (net.connected) {
        return { ...net, currentAvatar: avatarUrl || net.currentAvatar, lastSynced: timestamp };
      }
      return net;
    });

    res.json({
      success: true,
      syncedCount: networksList.filter(n => n.connected).length,
      timestamp,
      networks: networksList,
    });
  });

  // WhatsApp Chats & Assistant with @Alexandru Mention Enforcement
  interface ChatMessage {
    sender: 'user' | 'contact' | 'ai';
    text: string;
    time: string;
  }
  interface WhatsAppChat {
    id: string;
    name: string;
    phone: string;
    avatar: string;
    unread: number;
    messages: ChatMessage[];
  }

  let chatsList: WhatsAppChat[] = [
    {
      id: '1',
      name: 'Echipa Dezvoltare Tech',
      phone: '+40 721 999 888',
      avatar: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=150&auto=format&fit=crop&q=80',
      unread: 1,
      messages: [
        { sender: 'contact', text: 'Salut @Alexandru, poți verifica starea sincronizării pe WhatsApp Web?', time: '14:15' }
      ]
    },
    {
      id: '2',
      name: 'Ana Popescu',
      phone: '+40 733 444 555',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
      unread: 0,
      messages: [
        { sender: 'contact', text: 'Ne auzim mâine pentru proiect.', time: '11:20' }
      ]
    }
  ];

  app.get('/api/whatsapp/chats', (req, res) => {
    res.json(chatsList);
  });

  app.post('/api/whatsapp/messages/send', async (req, res) => {
    const { chatId, text } = req.body;
    const chat = chatsList.find(c => c.id === chatId);
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (chat && text) {
      chat.messages.push({ sender: 'user', text, time: now });

      // Enforce rule: respond ONLY when @Alexandru is mentioned in the chat message
      const mentionsAlexandru = text.toLowerCase().includes('@alexandru');
      if (mentionsAlexandru) {
        try {
          const aiResponse = await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: `User message in WhatsApp chat: "${text}". Reply concisely as the WhatsApp AI assistant because @Alexandru was mentioned.`,
            config: {
              systemInstruction: 'You are WhatsOmni AI WhatsApp assistant. You were triggered because @Alexandru was mentioned. Provide a helpful, professional reply.',
            },
          });
          const replyText = aiResponse.text || 'Salut! Am primit mențiunea ta @Alexandru pe WhatsApp.';
          chat.messages.push({ sender: 'ai', text: replyText, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
        } catch (e) {
          chat.messages.push({ sender: 'ai', text: 'Salut @Alexandru! Am preluat solicitarea ta.', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
        }
      }
    }

    res.json({ success: true, chats: chatsList });
  });

  // Vite middleware
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`WhatsOmni AI server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
