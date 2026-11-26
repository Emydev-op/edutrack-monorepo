import { Injectable } from '@nestjs/common';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import { displayPhone } from '../../platform/shared/format.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import { armLabel } from '../academics/academic-format.js';
import { GENDER_LABEL, ROLE_LABEL } from './boarding.service.js';
import { boardingSession } from './boarding-use.js';

/**
 * Teacher Workspace › My hostel: for house staff, the hostel (or floor) they look after this
 * session: each room's boarders with their class, bed, parent contact and medical notes (allergies
 * matter in a boarding house). Read-only; the office places boarders.
 */
@Injectable()
export class MyHostelService {
  constructor(private readonly tenant: TenantPrismaService) {}

  private get db() {
    return this.tenant.db;
  }

  async view(auth: AuthUserContext) {
    const m = await this.db.schoolMembership.findFirst({
      where: { id: auth.membershipId, userId: auth.userId, kind: 'STAFF', status: 'ACTIVE' },
      select: { staffId: true },
    });
    if (!m?.staffId)
      throw AppException.forbidden('This account isn’t a staff member here.', 'NO_ACCESS');
    const [posts, session] = await Promise.all([
      this.db.hostelStaff.findMany({
        where: { staffId: m.staffId, hostel: { archivedAt: null } },
        include: {
          floor: { select: { id: true, name: true } },
          hostel: { include: { branch: { select: { name: true } } } },
        },
      }),
      boardingSession(this.db),
    ]);
    if (!posts.length || !session) return { session: session?.name ?? null, hostels: [] };
    const hostels = [];
    for (const p of posts) {
      const rooms = await this.db.hostelRoom.findMany({
        where: {
          hostelId: p.hostelId,
          archivedAt: null,
          ...(p.role === 'FLOOR_MASTER' && p.floorId && { floorId: p.floorId }),
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: {
          floor: { select: { name: true } },
          allocations: {
            where: { enrollment: { sessionId: session.id, status: 'ACTIVE' } },
            include: {
              enrollment: {
                include: {
                  level: { select: { name: true } },
                  arm: { select: { name: true } },
                  student: {
                    select: {
                      id: true,
                      firstName: true,
                      surname: true,
                      gender: true,
                      admissionNo: true,
                      medicalNotes: true,
                      guardians: {
                        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
                        take: 1,
                        select: {
                          relationship: true,
                          guardian: {
                            select: { id: true, title: true, fullName: true, phone: true },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });
      const list = rooms.map((r) => ({
        id: r.id,
        name: r.name,
        floor: r.floor?.name ?? null,
        capacity: r.capacity,
        boarders: r.allocations
          .map((a) => {
            const s = a.enrollment.student;
            const g = s.guardians[0];
            return {
              studentId: s.id,
              name: `${s.firstName} ${s.surname}`,
              admissionNo: s.admissionNo,
              gender: s.gender === 'FEMALE' ? 'Female' : 'Male',
              className: a.enrollment.arm
                ? armLabel(a.enrollment.level.name, a.enrollment.arm.name)
                : a.enrollment.level.name,
              bed: a.bed,
              parent: g
                ? {
                    guardianId: g.guardian.id,
                    name: [g.guardian.title, g.guardian.fullName].filter(Boolean).join(' '),
                    relationship: g.relationship,
                    phone: g.guardian.phone ? displayPhone(g.guardian.phone) : '',
                  }
                : null,
              medicalNotes: s.medicalNotes ?? '',
            };
          })
          .sort((x, y) =>
            (x.bed ?? x.name).localeCompare(y.bed ?? y.name, 'en', { numeric: true }),
          ),
      }));
      const boarders = list.reduce((a, r) => a + r.boarders.length, 0);
      hostels.push({
        id: p.hostel.id,
        name: p.hostel.name,
        campus: p.hostel.branch.name,
        gender: GENDER_LABEL[p.hostel.gender],
        role: ROLE_LABEL[p.role],
        floor: p.floor?.name ?? null,
        rooms: list,
        totals: {
          rooms: list.length,
          places: list.reduce((a, r) => a + r.capacity, 0),
          boarders,
        },
      });
    }
    return { session: session.name, hostels };
  }
}
