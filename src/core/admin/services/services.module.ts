import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../../models/User/User.model';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [],
  exports: [],
})
export class ServicesModule {}
