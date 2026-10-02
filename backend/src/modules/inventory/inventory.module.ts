import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';

@Module({
  controllers: [],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}