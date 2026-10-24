'use client';

import { useEffect, useRef, useState } from 'react';
import { apiAudio } from '@/lib/api';

export type WakeState = 'off' | 'loading' | 'listening' | 'paused' | 'denied' | 'error';

const MODEL_URL = '/vosk/ru-small.tar.gz';
const WAKE = /привет\s*(за\s*за|заза)/;

/**
 * Waits for «Привет, ЗаЗа» on this device only. A small Russian Vosk model runs in the browser with a
 * grammar of just that phrase, so room sound is matched locally and never recorded or sent anywhere;
 * only what is said after the phrase is recorded, by the assistant.
 */
export function useVoiceWake({ enabled, paused, onWake }: { enabled: boolean; paused: boolean; onWake: () => void }) {
  const [state, setState] = useState<WakeState>('off');
  const [reason, setReason] = useState('');
  const pausedRef = useRef(paused);
  const wakeRef = useRef(onWake);
  const lastFired = useRef(0);
  pausedRef.current = paused;
  wakeRef.current = onWake;

  useEffect(() => {
    if (!enabled) { setState('off'); return; }
    if (typeof window === 'undefined' || !window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { setReason('страница открыта не по https'); setState('error'); return; }
    if (typeof WebAssembly === 'undefined' || typeof Worker === 'undefined') { setReason('браузер не поддерживает распознавание на устройстве'); setState('error'); return; }
    let cancelled = false;
    let stream: MediaStream | null = null;
    let context: AudioContext | null = null;
    let model: { terminate: () => void } | null = null;
    const resume = () => { void context?.resume(); };

    (async () => {
      setState('loading');
      try {
        // Asking right away is what the clinic wants: the permission prompt appears when the CRM opens.
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
      } catch {
        if (!cancelled) setState('denied');
        return;
      }
      try {
        const { createModel } = await import('vosk-browser');
        const loaded = await createModel(MODEL_URL);
        if (cancelled) { loaded.terminate(); return; }
        model = loaded;
        context = new AudioContext();
        const recognizer = new loaded.KaldiRecognizer(context.sampleRate, JSON.stringify(['привет за за', 'привет', 'за за', '[unk]']));
        const fire = (text: string) => {
          if (!WAKE.test(text) || pausedRef.current) return;
          const now = Date.now();
          if (now - lastFired.current < 2500) return;
          lastFired.current = now;
          wakeRef.current();
        };
        recognizer.on('result', (message) => fire(String((message as { result?: { text?: string } }).result?.text ?? '')));
        recognizer.on('partialresult', (message) => fire(String((message as { result?: { partial?: string } }).result?.partial ?? '')));
        const source = context.createMediaStreamSource(stream);
        const node = context.createScriptProcessor(4096, 1, 1);
        node.onaudioprocess = (event) => {
          if (pausedRef.current) return;
          try { recognizer.acceptWaveform(event.inputBuffer); } catch { /* a dropped frame is fine */ }
        };
        source.connect(node);
        node.connect(context.destination);
        // Browsers start audio suspended until the first tap or key.
        window.addEventListener('pointerdown', resume);
        window.addEventListener('keydown', resume);
        if (!cancelled) setState('listening');
      } catch (err) {
        console.error('[ЗаЗа] распознавание не запустилось', err);
        if (!cancelled) { setReason(err instanceof Error ? err.message.slice(0, 120) : String(err).slice(0, 120)); setState('error'); }
      }
    })();

    return () => {
      cancelled = true;
      window.removeEventListener('pointerdown', resume);
      window.removeEventListener('keydown', resume);
      stream?.getTracks().forEach((track) => track.stop());
      void context?.close();
      model?.terminate();
    };
  }, [enabled]);

  return { state: state === 'listening' && paused ? 'paused' : state, reason };
}

/** A short two-note chime: the assistant heard its name. */
export function chime() {
  try {
    const context = new AudioContext();
    const now = context.currentTime;
    [660, 880].forEach((frequency, index) => {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0, now + index * 0.12);
      gain.gain.linearRampToValueAtTime(0.12, now + index * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + index * 0.12 + 0.18);
      osc.connect(gain).connect(context.destination);
      osc.start(now + index * 0.12);
      osc.stop(now + index * 0.12 + 0.2);
    });
    window.setTimeout(() => void context.close(), 600);
  } catch { /* no audio output */ }
}

/** The most natural Russian voice that runs on this device: premium and enhanced voices first. */
function bestVoice() {
  const voices = window.speechSynthesis.getVoices().filter((item) => item.lang.toLowerCase().startsWith('ru') && item.localService);
  const score = (voice: SpeechSynthesisVoice) => {
    const name = voice.name.toLowerCase();
    if (/premium|премиум/.test(name)) return 4;
    if (/enhanced|улучш/.test(name)) return 3;
    if (/siri|katya|катя|milena|милена|yuri|юрий/.test(name)) return 2;
    return /compact|eloquence/.test(name) ? 0 : 1;
  };
  return voices.sort((a, b) => score(b) - score(a))[0] ?? null;
}

/** Spoken, not read out: no colons, signs or codes, short sentences, numbers as a person says them. */
export function spoken(text: string) {
  return text
    .replace(/[*_#>`«»]/g, '')
    .replace(/\s*:\s*$/g, '.')
    .replace(/:\s*/g, ', ')
    .replace(/(\d)\s(?=\d{3}\b)/g, '$1')
    .replace(/₽/g, 'рублей')
    .replace(/\s—\s/g, ', ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 400);
}

// Whether the clinic's server has the Yandex voice; learnt from the first try, kept for the visit.
let cloudVoice: boolean | null = null;
let playing: HTMLAudioElement | null = null;

/** Stops whatever ZaZa is saying. */
export function hush() {
  playing?.pause();
  playing = null;
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
}

function sayOnDevice(text: string) {
  if (!('speechSynthesis' in window)) return;
  const voice = bestVoice();
  if (!voice) return;
  const phrase = new SpeechSynthesisUtterance(text);
  phrase.voice = voice;
  phrase.lang = voice.lang;
  phrase.rate = 1;
  phrase.pitch = 1.05;
  window.speechSynthesis.speak(phrase);
}

/**
 * Says the reply: in Yandex's natural voice when the server has it (hosted in Russia), otherwise with
 * a voice on this device. Never with a foreign cloud voice, since replies name patients.
 */
export async function speak(raw: string) {
  if (typeof window === 'undefined' || !raw.trim()) return;
  const text = spoken(raw);
  hush();
  if (cloudVoice !== false) {
    try {
      const audio = await apiAudio('/assistant/speak', { text });
      if (audio && audio.size > 0) {
        cloudVoice = true;
        const url = URL.createObjectURL(audio);
        const player = new Audio(url);
        playing = player;
        player.onended = () => { URL.revokeObjectURL(url); if (playing === player) playing = null; };
        await player.play();
        return;
      }
      cloudVoice = false;
    } catch {
      // Autoplay refused or the network dropped: the device voice says it instead.
    }
  }
  sayOnDevice(text);
}
