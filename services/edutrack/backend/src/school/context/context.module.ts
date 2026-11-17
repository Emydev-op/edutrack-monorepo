import { Module } from '@nestjs/common';
import { AcademicsModule } from '../academics/academics.module.js';
import { ContextOptionsController } from './context-options.controller.js';
import { ContextOptionsService } from './context-options.service.js';

/** The School Admin header's working context (`/v1/context-options`). */
@Module({
  imports: [AcademicsModule],
  controllers: [ContextOptionsController],
  providers: [ContextOptionsService],
})
export class ContextModule {}
