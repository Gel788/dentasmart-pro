import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { generateOpaqueToken, hashToken } from '../common/token.util';
import { generateTotpSecret, verifyTotp } from '../common/totp.util';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email, isActive: true },
      include: {
        organization: true,
        employee: true,
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: { include: { permission: true } },
              },
            },
          },
        },
      },
    });

    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Неверный email или пароль');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const permissions = [
      ...new Set(
        user.userRoles.flatMap((ur) =>
          ur.role.rolePermissions.map((rp) => rp.permission.code),
        ),
      ),
    ];

    const payload = {
      sub: user.id,
      organizationId: user.organizationId,
      email: user.email,
    };

    const accessToken = await this.jwt.signAsync(payload);
    const refreshToken = await this.issueRefreshToken(user.id);

    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.id,
      entityType: 'User',
      entityId: user.id,
      action: 'LOGIN',
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        organization: {
          id: user.organization.id,
          name: user.organization.name,
          slug: user.organization.slug,
        },
        employee: user.employee
          ? {
              id: user.employee.id,
              firstName: user.employee.firstName,
              lastName: user.employee.lastName,
            }
          : null,
        permissions,
      },
    };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        organization: true,
        employee: true,
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: { include: { permission: true } },
              },
            },
          },
        },
      },
    });

    const permissions = [
      ...new Set(
        user.userRoles.flatMap((ur) =>
          ur.role.rolePermissions.map((rp) => rp.permission.code),
        ),
      ),
    ];

    return {
      id: user.id,
      email: user.email,
      organization: user.organization,
      employee: user.employee,
      permissions,
    };
  }

  private async issueRefreshToken(userId: string) {
    const raw = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await this.prisma.refreshToken.create({
      data: { userId, tokenHash: hashToken(raw), expiresAt },
    });
    return raw;
  }

  async refresh(refreshToken: string) {
    const hash = hashToken(refreshToken);
    const row = await this.prisma.refreshToken.findFirst({
      where: { tokenHash: hash, expiresAt: { gt: new Date() } },
      include: { user: true },
    });
    if (!row || !row.user.isActive) throw new UnauthorizedException();

    await this.prisma.refreshToken.delete({ where: { id: row.id } });
    const accessToken = await this.jwt.signAsync({
      sub: row.user.id,
      organizationId: row.user.organizationId,
      email: row.user.email,
    });
    const newRefresh = await this.issueRefreshToken(row.user.id);
    return { accessToken, refreshToken: newRefresh };
  }

  async setup2fa(userId: string) {
    const secret = generateTotpSecret();
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpSecret: secret, totpEnabled: false },
    });
    return { secret, uri: `otpauth://totp/DentaSmart?secret=${secret}&issuer=DentaSmart` };
  }

  async enable2fa(userId: string, code: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.totpSecret) throw new BadRequestException('Сначала настройте 2FA');
    if (!verifyTotp(user.totpSecret, code)) throw new BadRequestException('Неверный код');
    await this.prisma.user.update({ where: { id: userId }, data: { totpEnabled: true } });
    return { enabled: true };
  }

  async disable2fa(userId: string, code: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.totpEnabled && user.totpSecret && !verifyTotp(user.totpSecret, code)) {
      throw new BadRequestException('Неверный код');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpEnabled: false, totpSecret: null },
    });
    return { enabled: false };
  }
}
