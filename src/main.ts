import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
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

  // Versioned OpenAPI contract for the multi-app developer API. UI at /docs,
  // machine-readable spec at /docs-json.
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Sytadel Billing API')
    .setDescription(
      'Multi-app billing: organizations (tenants) register applications and ' +
        'environments, issue scoped API keys, configure provider connections ' +
        'and webhook endpoints, take payments, and read usage — each scoped to ' +
        'an application/environment.',
    )
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  const openApiDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, openApiDocument, {
    jsonDocumentUrl: 'docs-json',
  });

  const port = Number(process.env.PORT ?? 3020);
  await app.listen(port);

  console.log(`Billing API running on http://localhost:${port}/api`);
  console.log(`OpenAPI docs on http://localhost:${port}/docs`);
}

void bootstrap();
