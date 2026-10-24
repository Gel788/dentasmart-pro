/**
 * Which papers a visit needs. The rules follow the paid medical services rules (Government decree
 * No. 659 of 30.05.2026, in force from 01.09.2026), Federal law 323-FZ art. 20 on informed consent
 * (forms of Minzdrav order No. 1051n), and 152-FZ on personal data. A clinic's lawyer should still
 * read the printed wording once before the forms go to patients.
 */
export type DocumentKind =
  | 'CONTRACT'
  | 'PD_CONSENT'
  | 'HEALTH_FORM'
  | 'IDS_GENERAL'
  | 'IDS_INTERVENTION'
  | 'XRAY_CONSENT'
  | 'REFUSAL'
  | 'ESTIMATE'
  | 'ACT'
  | 'RECOMMENDATIONS'
  | 'TAX_CERT';

export type DocumentStatus = 'CREATED' | 'PRINTED' | 'SIGNED' | 'VOID';

export const DOCUMENT_TITLES: Record<DocumentKind, string> = {
  CONTRACT: 'Договор на оказание платных медицинских услуг',
  PD_CONSENT: 'Согласие на обработку персональных данных',
  HEALTH_FORM: 'Анкета о состоянии здоровья',
  IDS_GENERAL: 'Информированное добровольное согласие на виды медицинских вмешательств',
  IDS_INTERVENTION: 'Информированное добровольное согласие на стоматологическое вмешательство',
  XRAY_CONSENT: 'Согласие на рентгенологическое исследование',
  REFUSAL: 'Отказ от медицинского вмешательства',
  ESTIMATE: 'Смета (план лечения и стоимость)',
  ACT: 'Акт об оказании медицинских услуг',
  RECOMMENDATIONS: 'Рекомендации после приёма',
  TAX_CERT: 'Справка об оплате медицинских услуг для налогового органа',
};

/** Without these, signed, a visit does not start. */
export const BLOCKING_KINDS: DocumentKind[] = ['CONTRACT', 'PD_CONSENT', 'IDS_GENERAL', 'IDS_INTERVENTION', 'XRAY_CONSENT'];

/** How long a signed paper covers later visits. */
export const VALID_DAYS: Partial<Record<DocumentKind, number>> = {
  CONTRACT: 365,
  HEALTH_FORM: 365,
  IDS_GENERAL: 365,
  // Consent to personal data stands until it is withdrawn.
  PD_CONSENT: 100 * 365,
};

export type InterventionTopic = 'therapy' | 'endo' | 'surgery' | 'implant' | 'prosthetics' | 'ortho' | 'perio' | 'hygiene' | 'xray';

export const TOPIC_TITLES: Record<InterventionTopic, string> = {
  therapy: 'лечение кариеса и некариозных поражений зубов',
  endo: 'эндодонтическое лечение (лечение корневых каналов)',
  surgery: 'хирургическое вмешательство (удаление зуба и другие операции в полости рта)',
  implant: 'дентальная имплантация',
  prosthetics: 'ортопедическое лечение (протезирование)',
  ortho: 'ортодонтическое лечение',
  perio: 'лечение заболеваний пародонта',
  hygiene: 'профессиональная гигиена полости рта и отбеливание',
  xray: 'рентгенологическое исследование',
};

const TOPIC_WORDS: [InterventionTopic, RegExp][] = [
  ['implant', /имплант|синус-?лифт|костн\S* пластик|наращиван\S* кост/],
  ['surgery', /удален|экстракц|хирург|резекц|цистэктом|гемисекц|разрез|вскрыт|френулопласт|пластик\S* уздечк|альвеолит/],
  ['endo', /канал|эндодонт|пульпит|периодонтит|депульп|распломбир/],
  ['prosthetics', /протез|коронк|винир|вкладк|мост|ортопед|абатмент|культев/],
  ['ortho', /брекет|элайнер|ортодонт|ретейнер|трейнер|пластинк/],
  ['perio', /пародонт|кюретаж|шинирован|лоскут/],
  ['hygiene', /гигиен|чистк|air ?flow|скейлинг|отбелив|фторир|герметиз|полировк|налет|камн/],
  ['therapy', /кариес|пломб|реставрац|терапевт|клиновид|эрози|некариоз/],
  ['xray', /рентген|снимок|снимк|ортопантомо|оптг|визиограф|кт\b|кт-|кльт|томограф/],
];

/** The consent groups a service falls into, read from its name (and its group's name). */
export function topicsOf(...names: (string | null | undefined)[]): InterventionTopic[] {
  const text = names.filter(Boolean).join(' ').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  const found = new Set<InterventionTopic>();
  for (const [topic, words] of TOPIC_WORDS) if (words.test(text)) found.add(topic);
  return [...found];
}
