import { Module } from '@nestjs/common';
import { DamagesService } from './damages.service';

@Module({
  controllers: [],
  providers: [DamagesService],
  exports: [DamagesService],
})
export class DamagesModule {}