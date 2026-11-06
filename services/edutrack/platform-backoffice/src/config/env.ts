const mocksFlag = import.meta.env.VITE_USE_MOCKS;

/** Typed access to build-time configuration. */
export const env = {
  apiUrl: import.meta.env.VITE_API_URL ?? '/api',
  /**
   * Serve API calls from the in-browser mock until the backend endpoints exist. On by default in
   * development; production builds use it only when VITE_USE_MOCKS=true is set explicitly.
   */
  useMocks: mocksFlag === undefined ? import.meta.env.DEV : mocksFlag === 'true',
} as const;
