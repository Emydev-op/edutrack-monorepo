const mocksFlag = import.meta.env.VITE_USE_MOCKS;

/** Typed access to build-time configuration. */
export const env = {
  apiUrl: import.meta.env.VITE_API_URL ?? '/api',
  /**
   * Serve API calls from the in-browser mock instead of the backend. Off unless
   * VITE_USE_MOCKS=true is set (handy for working on screens without running the API).
   */
  useMocks: mocksFlag === 'true',
} as const;
