import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlatformOnly } from '../../auth/decorators/auth.decorators.js';
import { Clock } from '../../common/clock/clock.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { formatAgo } from '../shared/format.js';
import { RecordIdPipe } from '../shared/params.js';
import { PLATFORM_AREA } from '../shared/platform-audit.service.js';
import { HistoryQuery, HistoryService } from './history.service.js';
import { ResponseMessage } from '../../common/http/api-response.js';

const entryId = new RecordIdPipe('That audit entry doesn’t exist.');

@ApiTags('platform · activity')
@Controller('platform/activity')
export class ActivityController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly history: HistoryService,
    private readonly clock: Clock,
  ) {}

  @ResponseMessage('Activity loaded.')
  @Get()
  @PlatformOnly('Audit.View')
  @ApiOperation({ summary: 'Every back-office action in plain language, newest first' })
  list(@Query() query: HistoryQuery) {
    return this.history.activity(query);
  }

  @ResponseMessage('Recent activity loaded.')
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

@ApiTags('platform · activity')
@Controller('platform/audit')
export class AuditController {
  constructor(private readonly history: HistoryService) {}

  @ResponseMessage('Audit log loaded.')
  @Get()
  @PlatformOnly('Audit.View')
  @ApiOperation({ summary: 'The audit log: who changed what, before and after, from where' })
  list(@Query() query: HistoryQuery) {
    return this.history.audit(query);
  }

  @ResponseMessage('Actors loaded.')
  @Get('actors')
  @PlatformOnly('Audit.View')
  @ApiOperation({ summary: 'Names that appear in the trail, for the Actor filter' })
  actors() {
    return this.history.actors();
  }

  @ResponseMessage('Audit entry loaded.')
  @Get(':id')
  @PlatformOnly('Audit.View')
  entry(@Param('id', entryId) id: string) {
    return this.history.entry(id);
  }
}
