/**
 * SIGIL - Memetic Layer Protocol API
 *
 * Building intelligent agent networks through social coordination
 * on the Farcaster protocol.
 */

// Dependencies
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { Logger } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

// Authentication
import * as cookieParser from 'cookie-parser';

// Security
import helmet from 'helmet';
import * as csurf from 'csurf';
import domains, { csurfConfigOptions, getConfig } from './security/config';
import { csrfMiddleware } from './security/middlewares';

// Environment
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

// Modules
import { AppModule } from './app.module';

// Docs
import { swaggerOptions } from './doc';

export const logger = new Logger('APIGateway');

async function bootstrap() {
  try {
    const app = await NestFactory.create(AppModule);

    app.use(cookieParser(process.env.COOKIE_SECRET));

    const csrf = csurf(csurfConfigOptions);
    app.use((req: Request, res: Response, next: NextFunction) => {
      csrfMiddleware(req, res, next, csrf);
    });

    if (!getConfig().isProduction) {
      const document = SwaggerModule.createDocument(app, swaggerOptions);
      SwaggerModule.setup('doc', app, document);
    } else {
      app.use(helmet());
    }

    app.enableCors({
      origin: getConfig().isProduction
        ? domains.PRO
        : [...domains.LOCAL, ...domains.STAGING],

      credentials: true,
    });

    await app.listen(getConfig().runtime.port);

    getConfig().startup();
  } catch (e) {
    logger.error(e);
  }
}
void bootstrap();
