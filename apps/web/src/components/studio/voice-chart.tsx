'use client';

import { useRef, useState } from 'react';
import { VOICE_SCRIPT, parseVoice, type VoiceFinding, type VoiceNote } from '@/lib/voice';

type SpeechResult = { results: ArrayLike<{ 0: { transcript: string }; isFinal?: boolean }> };
type SpeechCtor = new () => {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechResult) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

export function VoiceChart({
  canWrite,
  onChange,
  onConfirm,
}: {
  canWrite: boolean;
  onChange: (parsed: { findings: VoiceFinding[]; note: VoiceNote; activeTooth: number | null }) => void;
  onConfirm: (parsed: { findings: VoiceFinding[]; note: VoiceNote }) => Promise<void> | void;
}) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [source, setSource] = useState<'speech' | 'script' | ''>('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const timer = useRef<number | null>(null);
  const mode = useRef<'speech' | 'script' | null>(null);
  const recognition = useRef<{ stop: () => void } | null>(null);
  const said = useRef('');

  const publish = (text: string) => {
    said.current = text;
    setTranscript(text);
    onChange(parseVoice(text));
  };

  const stopTimers = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    try { recognition.current?.stop(); } catch { /* already stopped */ }
    recognition.current = null;
  };

  const playScript = () => {
    if (mode.current === 'script') return;
    mode.current = 'script';
    setSource('script');
    setListening(true);
    const words = VOICE_SCRIPT.split(' ');
    let index = 0;
    const tick = () => {
      index += 1;
      publish(words.slice(0, index).join(' '));
      if (index < words.length) timer.current = window.setTimeout(tick, 220);
      else setListening(false);
    };
    tick();
  };

  const listen = () => {
    stopTimers();
    mode.current = null;
    setDone(false);
    setError('');
    const host = window as Window & { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
    const Ctor = host.SpeechRecognition ?? host.webkitSpeechRecognition;
    if (!Ctor) {
      playScript();
      return;
    }
    let heard = false;
    const session = new Ctor();
    session.lang = 'ru-RU';
    session.continuous = true;
    session.interimResults = true;
    session.onresult = (event) => {
      if (mode.current === 'script') return;
      heard = true;
      mode.current = 'speech';
      setSource('speech');
      const text = Array.from(event.results).map((row) => row[0]?.transcript ?? '').join(' ').trim();
      if (text) publish(text);
    };
    session.onerror = () => {
      if (!heard) playScript();
    };
    session.onend = () => {
      if (mode.current === 'speech') setListening(false);
    };
    recognition.current = session;
    try {
      session.start();
      setListening(true);
      setSource('speech');
    } catch {
      playScript();
      return;
    }
    timer.current = window.setTimeout(() => {
      if (mode.current === 'script') return;
      if (parseVoice(said.current).findings.length > 0) return;
      try { session.stop(); } catch { /* ignore */ }
      playScript();
    }, 1600);
  };

  const toggle = () => {
    if (listening) {
      stopTimers();
      mode.current = null;
      setListening(false);
      return;
    }
    listen();
  };

  const parsed = parseVoice(transcript);

  const confirm = async () => {
    setError('');
    try {
      await onConfirm(parsed);
      setDone(true);
      setListening(false);
      stopTimers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не записали формулу');
    }
  };

  return (
    <div className="vc">
      <div className="vc-top">
        <button className={`vc-mic${listening ? ' on' : ''}`} type="button" onClick={toggle} aria-label="Микрофон">
          <i />
          <i />
          <b />
        </button>
        <div>
          <strong>Голосовая карта</strong>
          <p className="sd-muted">{listening ? 'Слушаю приём' : source === 'script' ? 'Демо-фраза, микрофон не ответил' : 'Нажмите и говорите по-русски'}</p>
        </div>
      </div>
      <p className={`vc-line${transcript ? ' on' : ''}`} aria-live="polite">{transcript || 'Зуб, поверхность, диагноз — формула заполнится сама.'}</p>
      {parsed.findings.length > 0 && (
        <div className="sd-chips">
          {parsed.findings.map((item) => <span key={`${item.tooth}-${item.surface}`} className="sd-chip info">Зуб {item.tooth} · {item.label}</span>)}
        </div>
      )}
      {error && <p className="sd-chip danger">{error}</p>}
      {canWrite && parsed.findings.length > 0 && (
        <button className="sd-btn-ghost" type="button" onClick={() => void confirm()}>{done ? 'В карте' : 'Подтвердить'}</button>
      )}
    </div>
  );
}
