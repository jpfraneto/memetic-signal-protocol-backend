import { Module } from '@nestjs/common';
import { MFSService } from './mfs.service';

@Module({
  providers: [MFSService],
  exports: [MFSService],
})
export class MFSModule {}