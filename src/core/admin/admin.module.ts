// src/core/admin/admin.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Controllers
import { AdminController } from './admin.controller';

// Services
import { AdminService } from './services/admin.service';
import { ServicesModule } from './services/services.module';

// Models
import { User } from '../../models';

// External modules
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([User]), AuthModule, ServicesModule],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
