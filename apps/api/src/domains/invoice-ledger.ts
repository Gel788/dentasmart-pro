import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@dentasmart/database';
import { fromKopecks, invoiceStatus, kopecks, type InvoiceStatus } from '@dentasmart/shared';

type Tx = Prisma.TransactionClient;
type Method = Prisma.PaymentCreateInput['method'];

/**
 * Every change to what an invoice has been paid goes through here. The invoice row is locked for the
 * rest of the transaction, so two cashiers paying the same invoice at once queue instead of overwriting
 * each other, and the status always follows the one rule in @dentasmart/shared.
 */
export async function applyToInvoice(tx: Tx, organizationId: string, invoiceId: string, deltaKopecks: number) {
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM invoices WHERE id = ${invoiceId} AND "organizationId" = ${organizationId} FOR UPDATE`;
  if (!locked.length) throw new NotFoundException('Счёт не найден');
  const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  const paid = kopecks(invoice.paidAmount) + deltaKopecks;
  if (paid < 0) throw new BadRequestException('Возврат больше оплаченного по счёту');
  return tx.invoice.update({
    where: { id: invoiceId },
    data: {
      paidAmount: fromKopecks(paid),
      status: invoiceStatus({
        total: kopecks(invoice.totalAmount),
        discount: kopecks(invoice.discountAmount),
        paid,
        current: invoice.status as InvoiceStatus,
      }),
    },
  });
}

/** Recomputes the status after the total or the discount changed, with the same lock. */
export async function refreshInvoice(tx: Tx, organizationId: string, invoiceId: string) {
  return applyToInvoice(tx, organizationId, invoiceId, 0);
}

export interface PaymentInput {
  organizationId: string;
  patientId: string;
  amountKopecks: number;
  method: Method;
  invoiceId?: string | null;
  refundOfId?: string | null;
  createdById?: string | null;
  idempotencyKey?: string | null;
}

/**
 * Records one payment (or, with a negative amount, a refund) and applies it to its invoice.
 * The patient and the invoice must belong to the clinic, and the invoice to that patient.
 */
export async function recordPayment(tx: Tx, input: PaymentInput) {
  if (!Number.isInteger(input.amountKopecks) || input.amountKopecks === 0) throw new BadRequestException('Укажите сумму');
  const patient = await tx.patient.findFirst({ where: { id: input.patientId, organizationId: input.organizationId }, select: { id: true } });
  if (!patient) throw new NotFoundException('Пациент не найден');
  if (input.invoiceId) {
    const invoice = await tx.invoice.findFirst({
      where: { id: input.invoiceId, organizationId: input.organizationId },
      select: { patientId: true, status: true },
    });
    if (!invoice) throw new NotFoundException('Счёт не найден');
    if (invoice.patientId !== input.patientId) throw new BadRequestException('Счёт выставлен другому пациенту');
    if (invoice.status === 'CANCELLED' && input.amountKopecks > 0) throw new BadRequestException('Счёт отменён');
  }
  const payment = await tx.payment.create({
    data: {
      organizationId: input.organizationId,
      patientId: input.patientId,
      invoiceId: input.invoiceId ?? null,
      amount: fromKopecks(input.amountKopecks),
      method: input.method,
      refundOfId: input.refundOfId ?? null,
      createdById: input.createdById ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
    },
  });
  if (input.invoiceId) await applyToInvoice(tx, input.organizationId, input.invoiceId, input.amountKopecks);
  return payment;
}

/** A payment already stored under this key, so a repeated request returns it instead of charging twice. */
export async function paymentByKey(db: Tx, organizationId: string, idempotencyKey?: string | null) {
  if (!idempotencyKey) return null;
  return db.payment.findUnique({ where: { organizationId_idempotencyKey: { organizationId, idempotencyKey } } });
}

export function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** A sum from a request: bad input is the caller's mistake (400), not a server error. */
export function inputKopecks(value: unknown) {
  try {
    return kopecks(value as string);
  } catch {
    throw new BadRequestException('Сумма указана неверно');
  }
}

/** Splits a total into `months` lines that add up exactly; the last line takes the remainder. */
export function splitKopecks(totalKopecks: number, parts: number) {
  const base = Math.floor(totalKopecks / parts);
  return Array.from({ length: parts }, (_, index) => (index === parts - 1 ? totalKopecks - base * (parts - 1) : base));
}
