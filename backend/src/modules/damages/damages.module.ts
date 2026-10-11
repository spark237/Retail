import { Module } from '@nestjs/common';
import { DamagesService } from './damages.service';
import { DamageReportsController } from './damage-reports.controller';
@Module({
  controllers: [DamageReportsController],
  providers: [DamagesService],
  exports: [DamagesService],
})
export class DamagesModule {}