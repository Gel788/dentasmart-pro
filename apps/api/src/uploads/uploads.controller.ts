import { existsSync, mkdirSync } from 'fs';
import { extname, join } from 'path';
import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { AuthUser } from '@dentasmart/shared';
import type { Response } from 'express';
import { diskStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { issueAssetToken, verifyAssetToken } from '../common/asset-token.util';
import { CurrentUser } from '../common/current-user.decorator';

const imagingDir = join(process.cwd(), 'uploads', 'imaging');
const allowed = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.svg', '.dcm', '.stl', '.ply', '.obj', '.pdf']);
const safeName = /^[\w-]+(\.[\w]+)?$/;

@Controller('uploads')
export class UploadsController {
  @Post('imaging')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 40 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ext = extname(file.originalname || '').toLowerCase();
        if (allowed.has(ext)) cb(null, true);
        else cb(new BadRequestException('Этот формат файла не принимается'), false);
      },
      storage: diskStorage({
        destination: (req, _file, cb) => {
          const dir = join(imagingDir, (req.user as AuthUser).organizationId);
          mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req, file, cb) => {
          const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
          cb(null, `${suffix}${extname(file.originalname || '').toLowerCase()}`);
        },
      }),
    }),
  )
  upload(@CurrentUser() user: AuthUser, @UploadedFile() file?: Express.Multer.File) {
    if (!file) return { url: '' };
    return { url: `/uploads/imaging/${user.organizationId}/${file.filename}` };
  }

  /** Renews the read key for files without a full re-login. */
  @Get('token')
  @UseGuards(JwtAuthGuard)
  token(@CurrentUser() user: AuthUser) {
    return { assetToken: issueAssetToken(user.organizationId) };
  }

  @Get('imaging/:org/:file')
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  clinicFile(@Param('org') org: string, @Param('file') file: string, @Query('k') key: string, @Res() res: Response) {
    if (!safeName.test(org) || verifyAssetToken(key) !== org) throw new NotFoundException();
    this.send(res, join(imagingDir, org), file);
  }

  /** Files uploaded before per-clinic folders existed; any signed-in clinic may open them. */
  @Get('imaging/:file')
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  legacyFile(@Param('file') file: string, @Query('k') key: string, @Res() res: Response) {
    if (!verifyAssetToken(key)) throw new NotFoundException();
    this.send(res, imagingDir, file);
  }

  private send(res: Response, dir: string, file: string) {
    if (!safeName.test(file)) throw new NotFoundException();
    const path = join(dir, file);
    if (!existsSync(path)) throw new NotFoundException();
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.sendFile(path);
  }
}
