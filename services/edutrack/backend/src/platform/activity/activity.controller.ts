import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlatformOnly } from '../../auth/decorators/auth.decorators.js';
import { Clock } from '../../common/clock/clock.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { formatAgo } from '../shared/format.js';
import { PLATFORM_AREA } from '../shared/platform-audit.service.js';

@ApiTags('platform · activity')
@Controller('platform/activity')
export class ActivityController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  @Get('recent')
  @PlatformOnly()
  @ApiOperation({ summary: 'The latest back-office actions, for the dashboard' })
  async recent() {
    const now = this.clock.now();
    const events = await this.prisma.auditEvent.findMany({
      where: { area: PLATFORM_AREA },
      include: { school: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 8,
    });
    return events.map((e) => ({
      id: e.id,
      when: formatAgo(e.createdAt, now),
      actor: e.actorName ?? 'EduTrack',
      summary: e.summary,
      schoolName: e.school?.name ?? '—',
      entity: e.entityType,
    }));
  }
}
