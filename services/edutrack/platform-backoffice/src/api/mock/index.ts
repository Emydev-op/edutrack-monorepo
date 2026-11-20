import type { AxiosInstance } from 'axios';

import { unwrapEnvelope } from '@edutrack/web-core/http';
import { createMockAdapter } from '@edutrack/web-core/mock';
import './handlers/auth';
import './handlers/dashboard';
import './handlers/schools';
import './handlers/sms';
import './handlers/plans';
import './handlers/users';
import './handlers/support';
import './handlers/activity';
import './handlers/settings';

/** Answers in the same envelope as the real API, so the client unwraps both the same way. */
export const mockAdapter = createMockAdapter({ envelope: true });

console.info('[edutrack] Mock API enabled. Set VITE_USE_MOCKS=false to call the real backend.');

/** Routes every request on a client through the in-browser mock API (used by tests). */
export function installMockApi(client: AxiosInstance) {
  client.defaults.adapter = mockAdapter;
  unwrapEnvelope(client);
}
