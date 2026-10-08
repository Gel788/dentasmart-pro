import 'reflect-metadata';
import { config } from 'dotenv';
import { resolve } from 'path';
import { ValidationPipe } from '@nestjs/common';

config({ path: resolve(__dirname, '../.env') });
config({ path: resolve(__dirname, '../../../.env') });
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  if (process.env.NODE_ENV === 'production') {
    const secret = process.env.JWT_SECRET ?? '';
    if (secret.length < 24 || secret.includes('change-me')) {
      throw new Error('Для продакшена задайте длинный JWT_SECRET');
    }
  }
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' });

  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? ['http://localhost:3000'],
    credentials: true,
  });

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Sedrakoich dent API')
    .setDescription('REST API для CRM стоматологической клиники')
    .setVersion('0.1')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));

  const port = process.env.API_PORT ?? 4000;
  await app.listen(port);
  console.log(`🦷 API: http://localhost:${port}/api/v1`);
  console.log(`📚 Swagger: http://localhost:${port}/api/docs`);
}

bootstrap();
