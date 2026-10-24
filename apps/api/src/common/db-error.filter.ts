import { ArgumentsHost, Catch, ConflictException, HttpException, Logger, NotFoundException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '@dentasmart/database';

const OVERLAP: Record<string, string> = {
  appointments_cabinet_no_overlap: 'Кресло на это время уже занято. Выберите другое время или кресло',
  appointments_doctor_no_overlap: 'У врача на это время уже есть приём. Выберите другое время',
  appointments_time_order: 'Конец приёма должен быть позже начала',
};

/**
 * Turns the database's own refusals into answers a person can act on: a double booking caught by the
 * exclusion constraints is a 409, a missing row is a 404. Everything else keeps Nest's default handling,
 * and the raw database message never reaches the client.
 */
@Catch(Prisma.PrismaClientKnownRequestError, Prisma.PrismaClientUnknownRequestError)
export class DbErrorFilter extends BaseExceptionFilter {
  private readonly log = new Logger('DbErrorFilter');

  catch(error: Prisma.PrismaClientKnownRequestError | Prisma.PrismaClientUnknownRequestError, host: ArgumentsHost) {
    const mapped = this.map(error);
    if (!mapped) this.log.error(error instanceof Prisma.PrismaClientKnownRequestError ? `Prisma ${error.code}` : 'Prisma unknown request error');
    return super.catch(mapped ?? error, host);
  }

  private map(error: Prisma.PrismaClientKnownRequestError | Prisma.PrismaClientUnknownRequestError): HttpException | null {
    const constraint = Object.keys(OVERLAP).find((name) => error.message.includes(name));
    if (constraint) return new ConflictException(OVERLAP[constraint]);
    // Two writes raced for the same rows and Postgres stopped one of them; nothing was half-saved.
    if (/40P01|40001|deadlock detected|could not serialize/.test(error.message)) {
      return new ConflictException('Эти данные только что изменил кто-то ещё. Обновите страницу и повторите');
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') return new NotFoundException('Запись не найдена или уже удалена');
      if (error.code === 'P2002') return new ConflictException('Такая запись уже есть');
      if (error.code === 'P2003') return new ConflictException('Запись связана с другими данными и не может быть изменена так');
    }
    return null;
  }
}
