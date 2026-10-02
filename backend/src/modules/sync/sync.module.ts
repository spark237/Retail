import { Module } from '@nestjs/common';
import { SyncService } from './sync.service';

@Module({
  controllers: [],
  providers: [SyncService],
  exports: [SyncService],
})
export class SyncModule {}