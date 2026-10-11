import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SyncService } from './sync.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { SyncPullDto, SyncPushDto } from './dto/sync.dto';

/**
 * Offline sync endpoints: the device pushes a batch of offline records to
 * POST /sync/push (which applies them transactionally, resolving conflicts via
 * server_version) and pulls changes since a cursor with POST /sync/pull.
 */
@UseGuards(AuthGuard('jwt'))
@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post('push')
  async push(
    @TenantId() tenantId: string,
    @Body() dto: SyncPushDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.syncService.push(tenantId, dto, userId);
  }

  @Post('pull')
  async pull(
    @TenantId() tenantId: string,
    @Body() dto: SyncPullDto,
  ) {
    return this.syncService.pull(tenantId, dto);
  }
}