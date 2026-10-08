import { Body, Controller, Get, Inject, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '@dentasmart/shared';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return this.authService.me(user.id);
  }

  @Post('refresh')
  refresh(@Body() body: RefreshDto) {
    return this.authService.refresh(body.refreshToken);
  }

  @Post('2fa/setup')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  setup2fa(@CurrentUser() user: AuthUser) {
    return this.authService.setup2fa(user.id);
  }

  @Post('2fa/enable')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  enable2fa(@CurrentUser() user: AuthUser, @Body() body: { code: string }) {
    return this.authService.enable2fa(user.id, body.code);
  }

  @Post('2fa/disable')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  disable2fa(@CurrentUser() user: AuthUser, @Body() body: { code: string }) {
    return this.authService.disable2fa(user.id, body.code);
  }
}
