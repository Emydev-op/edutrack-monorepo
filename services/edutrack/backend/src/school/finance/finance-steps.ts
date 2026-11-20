import { Injectable } from '@nestjs/common';
import { Clock } from '../../common/clock/clock.js';
import { RequestContext } from '../../common/context/request-context.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import { SetupStateService } from '../shared/setup-state.service.js';
import type { SetupStepSource } from '../setup/setup-step-source.js';
import { FIN_ROUTE, plural } from './finance-format.js';
import { feesProgress, financeView } from './finance-summaries.js';

/**
 * The Setup Center's Fees step, from Finance (as the School Admin mock's `feesStep`): done once
 * the current term's fee structure is published (at any branch, or confirmed by hand); the
 * description says how far fee items, structures, invoices and the parents' bank account are.
 */
@Injectable()
export class FinanceSetupSteps {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly clock: Clock,
    private readonly setupState: SetupStateService,
  ) {}

  readonly all: SetupStepSource[] = [
    {
      id: 'fees',
      state: async () => {
        const [v, confirmed] = await Promise.all([
          financeView(this.tenant.db, RequestContext.schoolId()!, this.clock.now()),
          this.setupState.isConfirmed('fees'),
        ]);
        const to = { name: FIN_ROUTE.fees, query: { from: 'setup' } };
        const items = v.fin.items.filter((i) => i.status === 'Active').length;
        const x = feesProgress(v);
        if (!items || !x.term)
          return {
            description: 'Fee items, amounts per class, discounts and due dates',
            to,
            done: confirmed,
            blockers: [
              !x.term
                ? 'Create the academic session and its terms first.'
                : 'Add your fee items first, starting with Tuition.',
            ],
          };
        const term = x.term;
        const invoices = v.fin.invoices.filter(
          (i) => i.termId === term.id && i.status === 'Issued',
        ).length;
        const parentAccount = v.fin.accounts.some((a) => a.status === 'Active' && a.showToParents);
        return {
          description: [
            plural(items, 'fee item'),
            x.published === x.branches
              ? `${term.name} published`
              : `${term.name} published at ${x.published} of ${x.branches} branches`,
            invoices ? `${plural(invoices, 'invoice')} issued` : 'no invoices yet',
            ...(parentAccount ? [] : ['no bank account for parents']),
          ].join(' · '),
          to,
          done: x.published > 0 || confirmed,
          blockers: x.published ? [] : [`Publish ${term.name} fees in Finance › Fees first.`],
        };
      },
    },
  ];
}
