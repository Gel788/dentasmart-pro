import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from './permissions.decorator';
import { AuthUser } from '@dentasmart/shared';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required?.length) return true;

    const user = context.switchToHttp().getRequest().user as AuthUser;
    const hasAll = required.every((p) => user.permissions.includes(p));

    if (!hasAll) {
      throw new ForbiddenException('Недостаточно прав');
    }

    return true;
  }
}
