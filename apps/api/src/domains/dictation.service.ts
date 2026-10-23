import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * A doctor's dictation turned into a draft protocol. Both steps run on Russian-hosted models through
 * Polza AI, so the medical text never leaves Russia (152-FZ): speech-to-text, then a model that lays
 * the text out into the protocol fields and picks price-list services. Nothing is saved here: the
 * doctor reviews the draft and saves it with the usual protocol.
 */
const POLZA = 'https://polza.ai/api/v1';
const STT_MODEL = process.env.DICTATION_STT_MODEL || 'qwen/qwen3-asr-1.7b';
const TEXT_MODEL = process.env.DICTATION_MODEL || 'sber/gigachat-2';
const MAX_TEXT = 6000;
const POLL_MS = 3000;
const POLL_LIMIT_MS = 120_000;

export type DictationDraft = {
  transcript: string;
  fields: { complaints: string; anamnesis: string; objective: string; diagnosis: string; treatment: string; recommendations: string };
  services: { serviceId: string; name: string; price: number; toothNum: number | null }[];
  models: { stt: string | null; text: string };
};

type Fetch = typeof fetch;
const FIELD_KEYS = ['complaints', 'anamnesis', 'objective', 'diagnosis', 'treatment', 'recommendations'] as const;
const FDI = (value: unknown) => {
  const tooth = Number(value);
  return Number.isInteger(tooth) && ((tooth >= 11 && tooth <= 48 && tooth % 10 >= 1 && tooth % 10 <= 8) || (tooth >= 51 && tooth <= 85 && tooth % 10 >= 1 && tooth % 10 <= 5)) ? tooth : null;
};

@Injectable()
export class DictationService {
  private readonly log = new Logger('Dictation');
  /** Swappable in tests; production calls Polza. */
  http: Fetch = (input, init) => fetch(input, init);

  constructor(private readonly prisma: PrismaService) {}

  get enabled() {
    return Boolean(process.env.POLZA_API_KEY);
  }

  async draft(orgId: string, visitId: string, userId: string, input: { audio?: { buffer: Buffer; mimetype: string }; text?: string }): Promise<DictationDraft> {
    if (!this.enabled) throw new ServiceUnavailableException('Диктовка не подключена: на сервере нет ключа Polza AI');
    const visit = await this.prisma.appointment.findFirst({ where: { id: visitId, organizationId: orgId }, select: { id: true, patientId: true } });
    if (!visit) throw new NotFoundException('Визит не найден');

    let transcript = (input.text ?? '').trim();
    if (input.audio) transcript = await this.transcribe(input.audio.buffer, input.audio.mimetype);
    if (!transcript) throw new BadRequestException(input.audio ? 'Не удалось разобрать речь. Попробуйте ещё раз ближе к микрофону.' : 'Надиктуйте или введите текст приёма');
    if (transcript.length > MAX_TEXT) transcript = transcript.slice(0, MAX_TEXT);

    const services = await this.prisma.service.findMany({
      where: { organizationId: orgId, isActive: true },
      select: { id: true, name: true, basePrice: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      take: 150,
    });
    const parsed = await this.structure(transcript, services.map((row) => row.name));
    const picked = parsed.services
      .map((item) => {
        const service = services[item.index - 1];
        return service ? { serviceId: service.id, name: service.name, price: Number(service.basePrice), toothNum: FDI(item.tooth) } : null;
      })
      .filter((row): row is NonNullable<typeof row> => !!row);

    // Who dictated into which visit, and how much: never the medical text itself.
    await this.prisma.auditLog.create({
      data: { organizationId: orgId, userId, entityType: 'Dictation', entityId: visit.id, action: 'CREATE', changes: { chars: transcript.length, audio: !!input.audio, services: picked.length } },
    }).catch(() => undefined);

    return { transcript, fields: parsed.fields, services: picked, models: { stt: input.audio ? STT_MODEL : null, text: TEXT_MODEL } };
  }

  private headers() {
    return { Authorization: `Bearer ${process.env.POLZA_API_KEY}`, 'Content-Type': 'application/json' };
  }

  /** Speech to text; asynchronous models answer with a job that is polled until it finishes. */
  async transcribe(buffer: Buffer, mimetype: string): Promise<string> {
    const mime = (mimetype || 'audio/webm').split(';')[0];
    const body = JSON.stringify({ model: STT_MODEL, file: `data:${mime};base64,${buffer.toString('base64')}`, language: 'ru' });
    let job = await this.call(`${POLZA}/audio/transcriptions`, { method: 'POST', headers: this.headers(), body });
    const started = Date.now();
    while (job && job.status === 'processing' && job.id && Date.now() - started < POLL_LIMIT_MS) {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      job = await this.call(`${POLZA}/audio/transcriptions/${encodeURIComponent(String(job.id))}`, { headers: this.headers() });
    }
    if (job?.status === 'processing') throw new ServiceUnavailableException('Распознавание затянулось. Попробуйте ещё раз.');
    if (job?.status === 'failed') throw new ServiceUnavailableException('Не удалось распознать запись. Попробуйте ещё раз.');
    const segments = Array.isArray(job?.segments) ? (job.segments as { text?: string }[]).map((part) => part.text ?? '').join(' ') : '';
    return String(job?.text ?? segments ?? '').trim();
  }

  /** The text laid out into the protocol fields, plus price-list services by their number. */
  async structure(transcript: string, serviceNames: string[]) {
    const list = serviceNames.map((name, index) => `${index + 1}. ${name}`).join('\n');
    const system = [
      'Ты помогаешь стоматологу оформить протокол приёма по его диктовке. Пиши по-русски, медицинским языком, кратко.',
      'Раздели диктовку по полям: complaints (жалобы), anamnesis (анамнез заболевания), objective (объективно, зубная формула в нотации FDI), diagnosis (диагноз, с кодом МКБ-10 только если врач его назвал), treatment (проведённое лечение), recommendations (рекомендации).',
      'Бери только то, что сказал врач. Ничего не придумывай и не добавляй от себя; если поле не упомянуто, оставь пустую строку.',
      'В services перечисли услуги из прайса, которые врач провёл на этом приёме: index — номер услуги в прайсе, tooth — номер зуба FDI или null. Если подходящей услуги нет, не добавляй её.',
      'Ответь только JSON без пояснений: {"complaints":"","anamnesis":"","objective":"","diagnosis":"","treatment":"","recommendations":"","services":[{"index":1,"tooth":36}]}',
      '',
      'Прайс:',
      list || '(пусто)',
    ].join('\n');
    const answer = await this.call(`${POLZA}/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ model: TEXT_MODEL, temperature: 0.1, max_tokens: 1500, messages: [{ role: 'system', content: system }, { role: 'user', content: `Диктовка врача:\n${transcript}` }] }),
    });
    const content = String(answer?.choices?.[0]?.message?.content ?? '');
    return parseDraft(content);
  }

  private async call(url: string, init: RequestInit) {
    let response: Response;
    try {
      response = await this.http(url, { ...init, signal: AbortSignal.timeout(90_000) });
    } catch (err) {
      this.log.warn(`polza unreachable: ${err instanceof Error ? err.message : err}`);
      throw new ServiceUnavailableException('Сервис распознавания недоступен. Попробуйте ещё раз.');
    }
    const data = (await response.json().catch(() => null)) as Record<string, any> | null;
    if (!response.ok) {
      this.log.warn(`polza ${response.status}: ${JSON.stringify(data)?.slice(0, 300)}`);
      if (response.status === 402) throw new ServiceUnavailableException('На счёте Polza AI закончились средства');
      if (response.status === 403) throw new ServiceUnavailableException(`Модель ${String(url).includes('/audio/') ? STT_MODEL : TEXT_MODEL} не разрешена для ключа Polza AI. Включите её в настройках ключа в кабинете Polza — или продиктуйте текстом через микрофон клавиатуры.`);
      throw new ServiceUnavailableException('Сервис распознавания ответил ошибкой. Попробуйте ещё раз.');
    }
    return data;
  }
}

/** Reads the model's JSON even when it wraps it in prose or code fences; unknown keys are dropped. */
export function parseDraft(content: string) {
  const empty = { complaints: '', anamnesis: '', objective: '', diagnosis: '', treatment: '', recommendations: '' };
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  let raw: Record<string, unknown> = {};
  if (start >= 0 && end > start) {
    try { raw = JSON.parse(content.slice(start, end + 1)); } catch { raw = {}; }
  }
  const fields = { ...empty };
  for (const key of FIELD_KEYS) {
    const value = raw[key];
    if (typeof value === 'string') fields[key] = value.trim().slice(0, 2000);
  }
  const services = Array.isArray(raw.services)
    ? (raw.services as { index?: unknown; tooth?: unknown }[])
        .map((item) => ({ index: Number(item?.index), tooth: item?.tooth ?? null }))
        .filter((item) => Number.isInteger(item.index) && item.index > 0)
        .slice(0, 12)
    : [];
  return { fields, services };
}
