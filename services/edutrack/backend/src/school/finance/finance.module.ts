import { Module } from '@nestjs/common';
import { CommsCoreModule } from '../communication/comms-core.module.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { SectionAccessService } from '../shared/section-access.service.js';
import { MemberPermissions } from '../students/member-permissions.js';
import { AccountsController } from './accounts.controller.js';
import { AccountsService } from './accounts.service.js';
import { ExpensesController } from './expenses.controller.js';
import { ExpensesService } from './expenses.service.js';
import { FeesController } from './fees.controller.js';
import { FeesService } from './fees.service.js';
import { FinanceCore } from './finance-core.service.js';
import { FinanceNotifyService } from './finance-notify.service.js';
import { InvoicesController } from './invoices.controller.js';
import { InvoicesService } from './invoices.service.js';
import { FinanceOverviewController } from './overview.controller.js';
import { FinanceOverviewService } from './overview.service.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';

/**
 * School Admin › Finance (`/v1/finance/*`): fee items, structures, discounts, payment plans and
 * billing settings; invoices generated per term, student accounts; payments recorded by the
 * school or claimed by parents and verified, refunds; bank and cash accounts, transfers and
 * statement matching; expenses with approvals, vendors; the overview, reports and options.
 * Exports the overview service for the dashboard and Reports.
 */
@Module({
  imports: [CommsCoreModule],
  controllers: [
    FinanceOverviewController,
    FeesController,
    InvoicesController,
    PaymentsController,
    AccountsController,
    ExpensesController,
  ],
  providers: [
    FinanceCore,
    FinanceNotifyService,
    FeesService,
    InvoicesService,
    PaymentsService,
    AccountsService,
    ExpensesService,
    FinanceOverviewService,
    SectionAccessService,
    MemberPermissions,
    SchoolAuditService,
  ],
  exports: [FinanceCore, FinanceOverviewService],
})
export class FinanceModule {}
