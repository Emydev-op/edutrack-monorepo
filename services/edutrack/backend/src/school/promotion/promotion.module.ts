import { Module } from '@nestjs/common';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { SectionAccessService } from '../shared/section-access.service.js';
import { StudentsModule } from '../students/students.module.js';
import { PromotionController } from './promotion.controller.js';
import { PromotionService } from './promotion.service.js';

/**
 * End-of-session promotion (`/v1/academics/promotion`): decisions per class from each section's
 * rule (Assessment & Grading) and the session's published results, applied into the next
 * session. The session-closing checklist reads `promotionProgress()`.
 */
@Module({
  imports: [StudentsModule],
  controllers: [PromotionController],
  providers: [PromotionService, SectionAccessService, SchoolAuditService],
})
export class PromotionModule {}
