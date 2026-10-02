import { Module } from '@nestjs/common';
import { ShiftsService } from './shifts.service';

@Module({
  controllers: [],
  providers: [ShiftsService],
  exports: [ShiftsService],
})
export class ShiftsModule {}