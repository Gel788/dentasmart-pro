import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { Prisma } from '@dentasmart/database';
import { tzOffsetMinutes } from '@dentasmart/shared';
import { PrismaService } from '../prisma/prisma.service';
import { WidgetService } from './widget.service';

/** The cheapest current Claude model: the assistant only triages, explains and finds time. */
const MODEL = 'claude-haiku-5-5';
const MAX_TURNS = 20;
const MAX_MESSAGE = 1000;
const MAX_TOOL_ROUNDS = 4;

type Slot = { startsAt: string; endsAt: string };
export type AssistantReply = {
  chatId: string;
  reply: string;
  slots: Slot[];
  service: { id: string; name: string; price: number; durationMin: number } | null;
  urgent: boolean;
  done: boolean;
};

/**
 * Personal data stays out of the model: phone numbers, e-mails and long digit runs are masked before
 * a message leaves the server. Names and phones are collected by the form, never by the chat.
 */
export function redact(text: string) {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[почта скрыта]')
    .replace(/(?:\+?\d[\s()-]*){7,}/g, '[номер скрыт]');
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'list_services',
    description: 'Услуги клиники из прайса: id, название, цена в рублях, длительность в минутах. Вызывай, чтобы подобрать услугу под запрос пациента или ответить о ценах.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    name: 'find_slots',
    description: 'Свободное время для записи с учётом часов работы клиники. Вызывай, когда понятно, на какую услугу записывать. Даты — ГГГГ-ММ-ДД по времени клиники.',
    input_schema: {
      type: 'object',
      properties: {
        serviceId: { type: ['string', 'null'], description: 'id услуги из list_services или null, если услуга не выбрана' },
        dateFrom: { type: 'string', description: 'С какой даты искать, ГГГГ-ММ-ДД' },
        dateTo: { type: 'string', description: 'По какую дату искать, ГГГГ-ММ-ДД, не дальше 21 дня от dateFrom' },
        partOfDay: { type: 'string', enum: ['any', 'morning', 'afternoon', 'evening'], description: 'Предпочтение пациента по времени суток' },
      },
      required: ['serviceId', 'dateFrom', 'dateTo', 'partOfDay'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'note_for_clinic',
    description: 'Короткая записка для администратора: что беспокоит пациента и какая услуга подходит. Вызывай один раз, когда понял запрос; обнови, если запрос изменился.',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Одно-два предложения: жалоба или цель визита своими словами пациента, без диагнозов' },
        serviceId: { type: ['string', 'null'], description: 'id подходящей услуги или null' },
        urgent: { type: 'boolean', description: 'true при острой боли, отёке, травме, кровотечении, температуре' },
      },
      required: ['summary', 'serviceId', 'urgent'],
      additionalProperties: false,
    },
    strict: true,
  },
];

@Injectable()
export class BookingAssistantService {
  private readonly log = new Logger('BookingAssistant');
  private client: Anthropic | null = null;

  constructor(private readonly prisma: PrismaService, private readonly widget: WidgetService) {}

  /** Off until the server has an API key; the widget then offers the plain booking form. */
  get enabled() {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  }

  private api() {
    if (!this.enabled) throw new ServiceUnavailableException('ИИ-помощник не подключён. Выберите время сами.');
    this.client ??= new Anthropic({ maxRetries: 2, timeout: 30_000 });
    return this.client;
  }

  async chat(orgSlug: string, body: { chatId?: string; message: string; consent?: boolean }): Promise<AssistantReply> {
    const org = await this.prisma.organization.findUnique({ where: { slug: orgSlug }, select: { id: true, name: true, phone: true, address: true, workHours: true } });
    if (!org) throw new NotFoundException('Клиника не найдена');
    const text = (body.message ?? '').trim();
    if (!text) throw new BadRequestException('Напишите, что вас беспокоит');
    if (text.length > MAX_MESSAGE) throw new BadRequestException('Сообщение слишком длинное, сократите до 1000 знаков');
    const client = this.api();

    let chat = body.chatId ? await this.prisma.widgetChat.findFirst({ where: { id: body.chatId, organizationId: org.id } }) : null;
    if (!chat) {
      // Messages go to a model hosted abroad: no chat without the patient's explicit consent.
      if (body.consent !== true) throw new BadRequestException('Нужно согласие на обработку сообщений помощником');
      chat = await this.prisma.widgetChat.create({ data: { organizationId: org.id, consentAt: new Date() } });
    }
    if (chat.turns >= MAX_TURNS) throw new BadRequestException('Диалог слишком длинный. Выберите время сами или позвоните в клинику.');

    const branch = await this.prisma.branch.findFirst({ where: { organizationId: org.id, isActive: true, cabinets: { some: { isActive: true } } }, orderBy: { name: 'asc' } });
    if (!branch) throw new BadRequestException('У клиники нет филиала для записи');
    const messages = (chat.messages as unknown as Anthropic.MessageParam[]) ?? [];
    // The clock rides inside the patient's own turn so the stored history only ever grows.
    messages.push({ role: 'user', content: `[Сейчас ${nowLine(branch.timezone)}]\n${redact(text)}` });

    const state = { slots: [] as Slot[], serviceId: chat.serviceId, summary: chat.summary, urgent: chat.urgent };
    let reply = '';
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
      let response: Anthropic.Message;
      try {
        response = await client.messages.create({
          model: MODEL,
          max_tokens: 2000,
          output_config: { effort: 'low' },
          system: [{ type: 'text', text: systemPrompt(org), cache_control: { type: 'ephemeral' } }],
          tools: TOOLS,
          messages,
        });
      } catch (err) {
        this.log.warn(`assistant call failed: ${err instanceof Error ? err.message : err}`);
        if (err instanceof Anthropic.RateLimitError) throw new ServiceUnavailableException('Помощник перегружен. Попробуйте через минуту или выберите время сами.');
        throw new ServiceUnavailableException('Помощник сейчас недоступен. Выберите время сами.');
      }
      messages.push({ role: 'assistant', content: response.content });
      if (response.stop_reason === 'refusal') {
        reply = 'Не могу помочь с этим вопросом. Позвоните, пожалуйста, в клинику.';
        break;
      }
      const uses = response.content.filter((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use');
      reply = response.content.filter((block): block is Anthropic.TextBlock => block.type === 'text').map((block) => block.text).join('\n').trim();
      if (response.stop_reason !== 'tool_use' || uses.length === 0) break;
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const use of uses) {
        try {
          results.push({ type: 'tool_result', tool_use_id: use.id, content: JSON.stringify(await this.runTool(org.id, branch.id, branch.timezone, use, state)) });
        } catch (err) {
          results.push({ type: 'tool_result', tool_use_id: use.id, content: err instanceof Error ? err.message : 'Ошибка', is_error: true });
        }
      }
      messages.push({ role: 'user', content: results });
    }

    await this.prisma.widgetChat.update({
      where: { id: chat.id },
      data: {
        messages: messages as unknown as Prisma.InputJsonValue,
        turns: { increment: 1 },
        summary: state.summary,
        serviceId: state.serviceId,
        urgent: state.urgent,
      },
    });
    const service = state.serviceId
      ? await this.prisma.service.findFirst({ where: { id: state.serviceId, organizationId: org.id }, select: { id: true, name: true, basePrice: true, durationMin: true } })
      : null;
    return {
      chatId: chat.id,
      reply: reply || 'Выберите удобное время ниже.',
      slots: state.slots,
      service: service ? { id: service.id, name: service.name, price: Number(service.basePrice), durationMin: service.durationMin } : null,
      urgent: state.urgent,
      done: state.slots.length > 0,
    };
  }

  private async runTool(orgId: string, branchId: string, timeZone: string | null, use: Anthropic.ToolUseBlock, state: { slots: Slot[]; serviceId: string | null; summary: string | null; urgent: boolean }) {
    const input = (use.input ?? {}) as Record<string, unknown>;
    if (use.name === 'list_services') {
      const rows = await this.prisma.service.findMany({
        where: { organizationId: orgId, isActive: true },
        select: { id: true, name: true, basePrice: true, durationMin: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        take: 80,
      });
      return rows.map((row) => ({ id: row.id, name: row.name, price: Number(row.basePrice), durationMin: row.durationMin }));
    }
    if (use.name === 'find_slots') {
      const serviceId = typeof input.serviceId === 'string' ? input.serviceId : null;
      const service = serviceId ? await this.prisma.service.findFirst({ where: { id: serviceId, organizationId: orgId, isActive: true } }) : null;
      const from = String(input.dateFrom ?? '');
      const to = String(input.dateTo ?? from);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new Error('Даты в виде ГГГГ-ММ-ДД');
      const offset = tzOffsetMinutes(timeZone || 'Europe/Moscow', new Date());
      const start = Date.parse(`${from}T00:00:00Z`) - offset * 60000;
      const end = Math.min(Date.parse(`${to}T23:59:59Z`) - offset * 60000, start + 21 * 86400000);
      const all = await this.widget.freeSlots(orgId, branchId, service?.durationMin ?? 30, new Date(start), new Date(end), { limit: 60 });
      const part = String(input.partOfDay ?? 'any');
      const hour = (iso: string) => new Date(Date.parse(iso) + offset * 60000).getUTCHours();
      const fits = (slot: Slot) => part === 'morning' ? hour(slot.startsAt) < 12 : part === 'afternoon' ? hour(slot.startsAt) >= 12 && hour(slot.startsAt) < 17 : part === 'evening' ? hour(slot.startsAt) >= 17 : true;
      state.slots = all.filter(fits).slice(0, 8);
      if (service) state.serviceId = service.id;
      return state.slots.length
        ? { found: state.slots.length, slots: state.slots.map((slot) => slot.startsAt), note: 'Пациент увидит эти варианты кнопками под твоим ответом; не перечисляй их все, назови 1–2 ближайших.' }
        : { found: 0, note: 'Свободного времени нет; предложи другие даты или позвонить в клинику.' };
    }
    if (use.name === 'note_for_clinic') {
      state.summary = String(input.summary ?? '').slice(0, 500) || state.summary;
      state.serviceId = typeof input.serviceId === 'string' ? input.serviceId : state.serviceId;
      state.urgent = input.urgent === true;
      return { saved: true };
    }
    throw new Error('Нет такого инструмента');
  }
}

function nowLine(timeZone: string | null) {
  return new Intl.DateTimeFormat('ru-RU', { timeZone: timeZone || 'Europe/Moscow', weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date());
}

function systemPrompt(org: { name: string; phone: string | null; address: string | null; workHours: string | null }) {
  return [
    `Ты — помощник записи на сайте стоматологической клиники «${org.name}». Отвечай по-русски, коротко и тепло, как хороший администратор: 1–3 предложения.`,
    org.address ? `Адрес: ${org.address}.` : '',
    org.phone ? `Телефон клиники: ${org.phone}.` : '',
    org.workHours ? `Часы работы: ${org.workHours}.` : '',
    '',
    'Твоя задача: понять, с чем пациент хочет прийти, подобрать услугу из прайса и найти удобное время.',
    '1. Узнай, что беспокоит или какая цель визита, если пациент не сказал. Задавай не больше одного вопроса за раз.',
    '2. Подбери услугу через list_services. Если сомневаешься, предложи первичную консультацию или осмотр.',
    '3. Запиши суть запроса через note_for_clinic.',
    '4. Спроси, какие дни и время удобны, и найди варианты через find_slots. Пациент выберет время кнопкой и заполнит имя и телефон в форме — сам их не спрашивай и не записывай.',
    '',
    'Границы:',
    '- Ты не врач. Не ставь диагнозов, не назначай лекарства и лечение, не оценивай снимки. На медицинские вопросы отвечай, что их разберёт врач на приёме.',
    '- При сильной боли, отёке лица, травме, кровотечении или температуре отметь urgent и предложи ближайшее время; при угрозе жизни скажи звонить 103 или 112.',
    '- Цены называй только из прайса и говори, что точную стоимость врач скажет после осмотра.',
    '- Не обещай, что запись подтверждена: её подтвердит администратор клиники.',
    '- Не проси и не повторяй ФИО, телефон, паспорт и другие личные данные.',
    '- Говори только о записи в эту клинику; на посторонние темы вежливо возвращай к записи.',
  ].filter((line, index, all) => line || all[index - 1]).join('\n');
}
