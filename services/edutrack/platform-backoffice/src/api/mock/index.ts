import type { AxiosInstance } from 'axios';

import { mockAdapter } from '@edutrack/web-core/mock';
import './handlers/auth';
import './handlers/dashboard';
import './handlers/schools';
import './handlers/plans';
import './handlers/users';
import './handlers/support';
import './handlers/activity';
import './handlers/settings';

export { mockAdapter };

console.info('[edutrack] Mock API enabled. Set VITE_USE_MOCKS=false to call the real backend.');

/** Routes every request on a client through the in-browser mock API (used by tests). */
export function installMockApi(client: AxiosInstance) {
  client.defaults.adapter = mockAdapter;
}
