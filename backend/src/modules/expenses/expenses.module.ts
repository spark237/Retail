import { Module } from '@nestjs/common';
import { ExpensesService } from './expenses.service';

@Module({
  controllers: [],
  providers: [ExpensesService],
  exports: [ExpensesService],
})
export class ExpensesModule {}