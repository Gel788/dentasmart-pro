'use client';

import { useEffect, useRef, useState } from 'react';

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

/** Says the reply with a voice that runs on this device, so patient names are not sent to a cloud voice. */
export function speak(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || !text.trim()) return;
  const voices = window.speechSynthesis.getVoices();
  const voice = voices.find((item) => item.lang.startsWith('ru') && item.localService) ?? null;
  if (!voice) return;
  window.speechSynthesis.cancel();
  const phrase = new SpeechSynthesisUtterance(text.replace(/[*_#>`]/g, '').slice(0, 400));
  phrase.voice = voice;
  phrase.lang = voice.lang;
  phrase.rate = 1.05;
  window.speechSynthesis.speak(phrase);
}
