import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import type { GoogleGenAI } from '@google/genai';

export interface GeneratedAudioResult {
  buffer: Buffer;
  mimetype: string;
  ptt: boolean;
  seconds: number;
  engine: string;
}

export interface GeneratedVideoResult {
  buffer: Buffer;
  mimetype: 'video/mp4';
  jpegThumbnail: string;
  seconds: number;
  width: number;
  height: number;
  engine: string;
}

function execBinary(bin: string, args: string[], timeoutMs: number = 45000): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        return reject(new Error((stderr || stdout || err.message || `${bin} failed`).toString()));
      }
      resolve({ stdout: stdout.toString(), stderr: stderr.toString() });
    });
  });
}

function cleanTextForSpeech(rawText: string): string {
  return rawText
    .replace(/@\s*alex(andru)?/gi, '')
    .replace(/[*_~`#>]/g, ' ')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 480);
}

function splitSpeechChunks(text: string, maxLen: number = 175): string[] {
  const clean = text.trim();
  if (!clean) return ['Salut! Sunt aici.'];
  if (clean.length <= maxLen) return [clean];

  const chunks: string[] = [];
  let remaining = clean;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    let splitIdx = -1;
    for (const sep of ['. ', '! ', '? ', ', ', '; ', ' ']) {
      const idx = remaining.lastIndexOf(sep, maxLen);
      if (idx > Math.floor(maxLen * 0.4)) {
        splitIdx = idx + (sep === ' ' ? 0 : 1);
        break;
      }
    }
    if (splitIdx <= 0) splitIdx = maxLen;
    chunks.push(remaining.slice(0, splitIdx).trim());
    remaining = remaining.slice(splitIdx).trim();
  }
  return chunks.filter(Boolean);
}

async function generateRawSpeechFile(
  cleanText: string,
  tempDir: string,
  aiClient: GoogleGenAI | null
): Promise<{ filePath: string; engine: string }> {
  // 1. Primary: Gemini 3.8 Flash Lite TTS (outputs complete 24kHz mono WAV)
  if (aiClient) {
    try {
      const response = await aiClient.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: cleanText,
                speechMetadata: {
                  style: 'Natural, warm, conversational Romanian male voice on WhatsApp',
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Charon' },
            },
          },
        },
      });
      const b64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (b64) {
        const wavBuf = Buffer.from(b64, 'base64');
        if (wavBuf.length > 100) {
          const wavPath = path.join(tempDir, 'speech.wav');
          fs.writeFileSync(wavPath, wavBuf);
          return { filePath: wavPath, engine: 'Gemini 3.8 Flash Lite TTS' };
        }
      }
    } catch (geminiErr: any) {
      console.warn('[MEDIA_TTS] Gemini TTS unavailable, switching to chunked Google TTS:', geminiErr?.message || geminiErr);
    }
  }

  // 2. Fallback: Chunked Google Translate TTS (<=175 chars per chunk so HTTP 400 never happens)
  const chunks = splitSpeechChunks(cleanText, 175);
  const mp3Parts: Buffer[] = [];
  for (const chunk of chunks) {
    const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk)}&tl=ro&client=tw-ob`;
    const res = await fetch(ttsUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) {
      throw new Error(`TTS HTTP ${res.status}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 0) mp3Parts.push(buf);
  }

  if (mp3Parts.length === 0) {
    throw new Error('TTS returned empty audio');
  }

  const mp3Path = path.join(tempDir, 'speech.mp3');
  if (mp3Parts.length === 1) {
    fs.writeFileSync(mp3Path, mp3Parts[0]);
  } else {
    // Concatenate cleanly via ffmpeg concat list to avoid ID3 header glitches
    const listLines: string[] = [];
    mp3Parts.forEach((part, idx) => {
      const p = path.join(tempDir, `part_${idx}.mp3`);
      fs.writeFileSync(p, part);
      listLines.push(`file '${p.replace(/'/g, "'\\''")}'`);
    });
    const listFile = path.join(tempDir, 'concat.txt');
    fs.writeFileSync(listFile, listLines.join('\n'));
    await execBinary('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c:a', 'libmp3lame', '-b:a', '64k', mp3Path]);
  }

  return { filePath: mp3Path, engine: 'Google Romanian TTS' };
}

async function probeDurationSeconds(mediaPath: string, fallbackSeconds: number = 3): Promise<number> {
  try {
    const { stdout } = await execBinary('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      mediaPath,
    ], 8000);
    const parsed = parseFloat(stdout.trim());
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.max(1, Math.ceil(parsed));
    }
  } catch {}
  return fallbackSeconds;
}

/**
 * Generates a true WhatsApp PTT Voice Note (OGG/Opus) from text.
 */
export async function generateWhatsAppVoiceNote(
  text: string,
  aiClient: GoogleGenAI | null
): Promise<GeneratedAudioResult> {
  const cleanText = cleanTextForSpeech(text) || 'Salut! Mesaj audio trimis de Alexandru.';
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa_audio_'));

  try {
    const { filePath: rawAudioPath, engine } = await generateRawSpeechFile(cleanText, tempDir, aiClient);
    const oggPath = path.join(tempDir, 'voice_note.ogg');

    try {
      await execBinary('ffmpeg', [
        '-y',
        '-i',
        rawAudioPath,
        '-vn',
        '-c:a',
        'libopus',
        '-b:a',
        '32k',
        '-vbr',
        'on',
        '-ar',
        '48000',
        '-ac',
        '1',
        '-application',
        'voip',
        oggPath,
      ]);

      const oggBuffer = fs.readFileSync(oggPath);
      const seconds = await probeDurationSeconds(oggPath, Math.max(2, Math.ceil(cleanText.length / 13)));
      return {
        buffer: oggBuffer,
        mimetype: 'audio/ogg; codecs=opus',
        ptt: true,
        seconds,
        engine,
      };
    } catch (ffmpegErr: any) {
      console.warn('[MEDIA_TTS] OGG/Opus transcode failed, falling back to audio/mpeg:', ffmpegErr?.message || ffmpegErr);
      const rawBuf = fs.readFileSync(rawAudioPath);
      const isWav = rawAudioPath.endsWith('.wav');
      return {
        buffer: rawBuf,
        mimetype: isWav ? 'audio/wav' : 'audio/mpeg',
        ptt: false,
        seconds: Math.max(2, Math.ceil(cleanText.length / 13)),
        engine,
      };
    }
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
}

function extractVideoTopic(promptText: string): string {
  const cleaned = promptText
    .replace(/@\s*alex(andru)?/gi, ' ')
    .replace(
      /\b(trimite|da-mi|dami|fa-mi|fami|vreau|un|o|mesaj|video|videoclip|clip|filmulet|filmuleț|film|cu|despre|pe|whatsapp|te|rog|sa|să|fie|pentru|mine|audio|sunet|voce)\b/gi,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length >= 2 ? cleaned : 'cinematic neon city aesthetic';
}

/**
 * Generates a real H.264 + AAC MP4 Video clip with spoken Romanian voiceover and topic-matched visuals.
 */
export async function generateWhatsAppVideoClip(options: {
  promptText: string;
  replyText: string;
  aiClient: GoogleGenAI | null;
  fetchImages: (query: string) => Promise<string[]>;
  fetchImageBuffer: (url: string, allowFallback?: boolean) => Promise<Buffer>;
}): Promise<GeneratedVideoResult> {
  const { promptText, replyText, aiClient, fetchImages, fetchImageBuffer } = options;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa_video_'));
  const cleanSpeech = cleanTextForSpeech(replyText) || 'Salut! Iată mesajul tău video de la Alexandru.';
  const topic = extractVideoTopic(promptText);

  try {
    // Run TTS + Image discovery in parallel
    const [speechResult, candidateUrls] = await Promise.all([
      generateRawSpeechFile(cleanSpeech, tempDir, aiClient).catch(async () => {
        // Guaranteed silent AAC fallback audio if network TTS fails
        const silentWav = path.join(tempDir, 'silent.wav');
        await execBinary('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', '4', silentWav]);
        return { filePath: silentWav, engine: 'Fallback Silent' };
      }),
      fetchImages(topic).catch(() => [] as string[]),
    ]);

    const audioDuration = Math.max(4, Math.min(20, await probeDurationSeconds(speechResult.filePath, 5)));

    // Download and normalize up to 3 visual frames (720x720 JPEG)
    const framePaths: string[] = [];
    for (const url of candidateUrls.slice(0, 5)) {
      if (framePaths.length >= 3) break;
      try {
        const rawBuf = await fetchImageBuffer(url, false);
        const frameBuf = await sharp(rawBuf, { animated: false, limitInputPixels: false })
          .rotate()
          .flatten({ background: { r: 15, g: 23, b: 42 } })
          .resize(720, 720, { fit: 'cover', position: 'centre' })
          .jpeg({ quality: 88 })
          .toBuffer();
        const framePath = path.join(tempDir, `frame_${framePaths.length}.jpg`);
        fs.writeFileSync(framePath, frameBuf);
        framePaths.push(framePath);
      } catch {}
    }

    // Ensure at least 1 crisp visual frame exists
    if (framePaths.length === 0) {
      const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="720">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#0f172a"/>
            <stop offset="50%" stop-color="#065f46"/>
            <stop offset="100%" stop-color="#0284c7"/>
          </linearGradient>
        </defs>
        <rect width="720" height="720" fill="url(#g)"/>
        <circle cx="360" cy="330" r="130" fill="#ffffff" fill-opacity="0.08"/>
        <text x="360" y="345" font-family="sans-serif" font-size="44" font-weight="bold" fill="#ffffff" text-anchor="middle">WhatsOmni AI</text>
        <text x="360" y="405" font-family="sans-serif" font-size="24" fill="#a7f3d0" text-anchor="middle">Mesaj Video WhatsApp</text>
      </svg>`;
      const fallbackBuf = await sharp(Buffer.from(fallbackSvg)).jpeg({ quality: 88 }).toBuffer();
      const framePath = path.join(tempDir, 'frame_0.jpg');
      fs.writeFileSync(framePath, fallbackBuf);
      framePaths.push(framePath);
    }

    // Build 320x320 JPEG thumbnail for WhatsApp preview
    const thumbBuf = await sharp(framePaths[0]).resize(320, 320, { fit: 'cover' }).jpeg({ quality: 75 }).toBuffer();
    const jpegThumbnail = thumbBuf.toString('base64');

    const outputMp4Path = path.join(tempDir, 'output.mp4');

    if (framePaths.length === 1) {
      // Single image with smooth subtle scale/pan animation + audio
      await execBinary(
        'ffmpeg',
        [
          '-y',
          '-loop',
          '1',
          '-i',
          framePaths[0],
          '-i',
          speechResult.filePath,
          '-t',
          String(audioDuration),
          '-vf',
          'scale=800:800,crop=720:720:x=\'(iw-ow)/2+20*sin(t)\':y=\'(ih-oh)/2+20*cos(t)\',format=yuv420p',
          '-r',
          '24',
          '-c:v',
          'libx264',
          '-preset',
          'ultrafast',
          '-tune',
          'stillimage',
          '-c:a',
          'aac',
          '-b:a',
          '128k',
          '-ar',
          '44100',
          '-movflags',
          '+faststart',
          '-shortest',
          outputMp4Path,
        ],
        60000
      );
    } else {
      // Multi-frame slideshow synced across full audio duration
      const perFrame = Math.max(1.5, audioDuration / framePaths.length);
      const concatLines: string[] = [];
      for (const fp of framePaths) {
        concatLines.push(`file '${fp.replace(/'/g, "'\\''")}'`);
        concatLines.push(`duration ${perFrame.toFixed(2)}`);
      }
      // ffmpeg concat demuxer requires repeating the final image without duration
      concatLines.push(`file '${framePaths[framePaths.length - 1].replace(/'/g, "'\\''")}'`);
      const concatPath = path.join(tempDir, 'frames.txt');
      fs.writeFileSync(concatPath, concatLines.join('\n'));

      await execBinary(
        'ffmpeg',
        [
          '-y',
          '-f',
          'concat',
          '-safe',
          '0',
          '-i',
          concatPath,
          '-i',
          speechResult.filePath,
          '-t',
          String(audioDuration),
          '-vf',
          'scale=720:720,fps=24,format=yuv420p',
          '-c:v',
          'libx264',
          '-preset',
          'ultrafast',
          '-c:a',
          'aac',
          '-b:a',
          '128k',
          '-ar',
          '44100',
          '-movflags',
          '+faststart',
          '-shortest',
          outputMp4Path,
        ],
        60000
      );
    }

    const mp4Buffer = fs.readFileSync(outputMp4Path);
    const finalSeconds = await probeDurationSeconds(outputMp4Path, audioDuration);

    return {
      buffer: mp4Buffer,
      mimetype: 'video/mp4',
      jpegThumbnail,
      seconds: finalSeconds,
      width: 720,
      height: 720,
      engine: `FFmpeg H.264/AAC + ${speechResult.engine}`,
    };
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
}
