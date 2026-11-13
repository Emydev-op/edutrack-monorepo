import { createQueryClient } from '@edutrack/web-core/query';

/** The app's one QueryClient, shared by the Vue plugin and the router's access guard. */
export const queryClient = createQueryClient();
