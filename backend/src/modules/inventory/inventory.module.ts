import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { MovementsController } from './movements.controller';
import { TransfersController } from './transfers.controller';
@Module({
  controllers: [InventoryController, MovementsController, TransfersController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}