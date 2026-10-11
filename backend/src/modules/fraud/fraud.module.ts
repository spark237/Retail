import { Module } from '@nestjs/common';
import { FraudService } from './fraud.service';
import { FraudController } from './fraud.controller';
@Module({
  controllers: [FraudController],
  providers: [FraudService],
  exports: [FraudService],
})
export class FraudModule {}