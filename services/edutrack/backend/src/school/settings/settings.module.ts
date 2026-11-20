import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { AcademicsModule } from '../academics/academics.module.js';
import { CommsCoreModule } from '../communication/comms-core.module.js';
import { CurriculumModule } from '../curriculum/curriculum.module.js';
import { SetupModule } from '../setup/setup.module.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { SettingsSecurityService } from './settings-security.service.js';
import { SchoolSettingsController } from './settings.controller.js';
import { SchoolSettingsService } from './settings.service.js';

/** School Admin › Settings (`/v1/settings/*`). */
@Module({
  imports: [AuthModule, AcademicsModule, CurriculumModule, SetupModule, CommsCoreModule],
  controllers: [SchoolSettingsController],
  providers: [SchoolSettingsService, SettingsSecurityService, SchoolAuditService],
})
export class SchoolSettingsModule {}
