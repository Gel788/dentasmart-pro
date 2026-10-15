import { mkdirSync } from 'fs';
import { extname, join } from 'path';
import { Controller, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

const imagingDir = join(process.cwd(), 'uploads', 'imaging');

@Controller('uploads')
@UseGuards(JwtAuthGuard)
export class UploadsController {
  @Post('imaging')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 40 * 1024 * 1024 },
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          mkdirSync(imagingDir, { recursive: true });
          cb(null, imagingDir);
        },
        filename: (_req, file, cb) => {
          const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
          cb(null, `${suffix}${extname(file.originalname || '')}`);
        },
      }),
    }),
  )
  upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file) return { url: '' };
    return { url: `/uploads/imaging/${file.filename}` };
  }
}
