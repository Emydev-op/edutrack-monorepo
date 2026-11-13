import { mockAdapter } from '@edutrack/web-core/mock';
import type { AxiosInstance } from 'axios';

import './handlers/academics';
import './handlers/academics-results';
import './handlers/attendance';
import './handlers/auth';
import './handlers/dashboard';
import './handlers/finance-fees';
import './handlers/finance-invoices';
import './handlers/finance-payments';
import './handlers/finance-accounts';
import './handlers/finance-expenses';
import './handlers/finance-overview';
import './handlers/setup';
import './handlers/organogram';
import './handlers/school';
import './handlers/shell';
import './handlers/staff';
import './handlers/students';
import './handlers/users';
import './handlers/communication';
import './handlers/reports';
import './handlers/settings';
import './handlers/support';

export { mockAdapter };

console.info('[edutrack] Mock API enabled. Set VITE_USE_MOCKS=false to call the real backend.');

/** Routes every request on a client through the in-browser mock API (used by tests). */
export function installMockApi(client: AxiosInstance) {
  client.defaults.adapter = mockAdapter;
}
