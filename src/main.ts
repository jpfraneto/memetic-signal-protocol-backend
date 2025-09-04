/**
 * SIGIL - Memetic Layer Protocol API
 *
 * Building intelligent agent networks through social coordination
 * on the Farcaster protocol.
 */

// Dependencies
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { SwaggerModule } from '@nestjs/swagger';
import { Logger } from '@nestjs/common';

// Security
import domains, { getConfig } from './security/config';

// Environment
import * as dotenv from 'dotenv';
dotenv.config({
  path: process.env.NODE_ENV === 'production' ? '.env' : '.env.development',
});

// Modules
import { AppModule } from './app.module';

// Docs
import { swaggerOptions } from './doc';

export const logger = new Logger('APIGateway');

async function bootstrap() {
  try {
    const app = await NestFactory.create<NestFastifyApplication>(
      AppModule,
      new FastifyAdapter(),
    );

    await app.register(require('@fastify/cookie'), {
      secret: process.env.COOKIE_SECRET,
    });

    if (!getConfig().isProduction) {
      const document = SwaggerModule.createDocument(app, swaggerOptions);
      SwaggerModule.setup('doc', app, document);
    } else {
      await app.register(require('@fastify/helmet'));
    }

    app.enableCors({
      origin: getConfig().isProduction
        ? domains.PRO
        : [...domains.LOCAL, ...domains.STAGING],
      credentials: true,
    });

    const port = Number(process.env.PORT || getConfig().runtime.port || 3000);

    await app.listen(port, '0.0.0.0');

    getConfig().startup();
  } catch (e) {
    logger.error(e);
  }
}
void bootstrap();
