import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Portals } from '../../auth/decorators/auth.decorators.js';
import { PortalAccessService } from '../../auth/portal-access.service.js';
import { leftOnOf, readOnlyUntil } from '../../auth/school-portal-rules.js';
import { CurrentUser } from '../../common/decorators/request.decorators.js';
import { AppException } from '../../common/errors/app.exception.js';
import { ResponseMessage } from '../../common/http/api-response.js';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import { ParentChildDto } from './dto/guardians.responses.js';
import { placements, STUDENT_STATUS_LABEL } from './family-records.js';

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Parent Portal (`<slug>.edutrack.ng/parent`). Its data API comes later; this lists the signed-in
 * parent's children at the host school with what they may see, so the leavers rule is enforced
 * in one place: `full` while the child is on the roll, `read-only` for two years after they left.
 */
@ApiTags('parent portal')
@Portals('PARENT')
@Controller('parent')
export class ParentController {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly access: PortalAccessService,
  ) {}

  @ResponseMessage('Children loaded.')
  @Get('children')
  @ApiOperation({
    summary: 'The signed-in parent’s children at this school',
    description:
      'Only children at the school on the address. `access` is `full` for a current student and ' +
      '`read-only` for one who left less than two years ago; older leavers are not listed.',
  })
  @ApiOkResponse({ type: [ParentChildDto] })
  @ApiForbiddenResponse({ description: 'PARENT_ACCESS_ENDED, NO_ACCESS' })
  async children(@CurrentUser() auth: AuthUserContext) {
    const m = await this.tenant.db.schoolMembership.findFirst({
      where: { id: auth.membershipId, userId: auth.userId, kind: 'GUARDIAN', status: 'ACTIVE' },
      select: { guardianId: true },
    });
    if (!m?.guardianId)
      throw AppException.forbidden(
        'This account doesn’t have access to the Parent Portal at this school.',
        'NO_ACCESS',
      );
    const schoolId = auth.schoolId!;
    const children = await this.access.parentChildren(schoolId, m.guardianId);
    if (!children.length)
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'Your children are no longer at this school, so this parent account has closed.',
        'PARENT_ACCESS_ENDED',
      );
    const ids = children.map((c) => c.studentId);
    const [students, places] = await Promise.all([
      this.tenant.db.student.findMany({ where: { id: { in: ids } } }),
      placements(this.tenant.db, ids),
    ]);
    return children.map((c) => {
      const s = students.find((x) => x.id === c.studentId)!;
      const left = c.access === 'read-only' ? leftOnOf(s) : null;
      return {
        id: s.id,
        name: `${s.firstName} ${s.surname}`,
        admissionNo: s.admissionNo,
        className: places.get(s.id)?.className ?? '',
        branch: places.get(s.id)?.branchName ?? '',
        status: STUDENT_STATUS_LABEL[s.status],
        relationship: c.relationship,
        access: c.access,
        leftOn: left ? iso(left) : null,
        readOnlyUntil: left ? iso(readOnlyUntil(left)) : null,
      };
    });
  }
}
