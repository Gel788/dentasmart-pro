import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthUser } from '@dentasmart/shared';

export const OrgId = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) =>
    (ctx.switchToHttp().getRequest().user as AuthUser).organizationId,
);
