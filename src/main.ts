import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });

  // Security headers (HSTS, X-Content-Type-Options, frameguard, etc.).
  app.use(helmet());

  // Trust the reverse proxy so per-IP rate limiting sees the real client IP.
  (
    app.getHttpAdapter().getInstance() as unknown as {
      set: (k: string, v: unknown) => void;
    }
  ).set('trust proxy', true);

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = Number(process.env.PORT ?? 3020);
  await app.listen(port);

  console.log(`Billing API running on http://localhost:${port}/api`);
}

void bootstrap();
