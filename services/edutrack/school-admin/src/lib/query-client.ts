import { createQueryClient } from '@edutrack/web-core/query';

/** The app's one query cache, shared with the router (the setup guard reads it). */
export const queryClient = createQueryClient();
