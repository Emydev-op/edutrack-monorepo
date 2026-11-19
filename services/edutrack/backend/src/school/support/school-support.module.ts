import { Module } from '@nestjs/common';
import { PlatformModule } from '../../platform/platform.module.js';
import { SchoolSupportController } from './school-support.controller.js';
import { SchoolSupportService } from './school-support.service.js';

/** School Admin › Support (`/v1/support/tickets`): the school's side of the EduTrack desk. */
@Module({
  imports: [PlatformModule],
  controllers: [SchoolSupportController],
  providers: [SchoolSupportService],
})
export class SchoolSupportModule {}
