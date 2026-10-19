import { BadRequestException, createParamDecorator, ExecutionContext } from '@nestjs/common';

/** The client's `Idempotency-Key` header: one value per attempt, so a retry or a double click is answered once. */
export const IdempotencyKey = createParamDecorator((_: unknown, ctx: ExecutionContext): string | undefined => {
  const raw = ctx.switchToHttp().getRequest().headers['idempotency-key'];
  const key = Array.isArray(raw) ? raw[0] : raw;
  if (key === undefined || key === '') return undefined;
  if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{8,80}$/.test(key)) throw new BadRequestException('Неверный Idempotency-Key');
  return key;
});
