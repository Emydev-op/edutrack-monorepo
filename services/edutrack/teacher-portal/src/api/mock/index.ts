import { mockAdapter } from '@edutrack/web-core/mock';
import type { AxiosInstance } from 'axios';

// Shell (foundation)
import './handlers/auth';
import './handlers/shell';
import './handlers/notifications';
import './handlers/announcements';
import './handlers/profile';
// Feature areas: each builder fills in their own file; this list doesn't change.
import './handlers/dashboard';
import './handlers/teaching';
import './handlers/assignments';
import './handlers/materials';
import './handlers/assessments';
import './handlers/results';
import './handlers/reviews';
import './handlers/lesson-notes';
import './handlers/class-teacher';

export { mockAdapter };

if (import.meta.env.MODE !== 'test')
  console.info('[edutrack] Mock API enabled. Set VITE_USE_MOCKS=false to call the real backend.');

/** Routes every request on a client through the in-browser mock API (used by tests). */
export function installMockApi(client: AxiosInstance) {
  client.defaults.adapter = mockAdapter;
}
