import { Module } from '@nestjs/common';
import { SalesService } from './sales.service';

@Module({
  controllers: [],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}