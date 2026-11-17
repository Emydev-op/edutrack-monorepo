const mocksFlag = import.meta.env.VITE_USE_MOCKS;

/** Typed access to build-time configuration. */
export const env = {
  apiUrl: import.meta.env.VITE_API_URL ?? '/api',
  /**
   * Serve API calls from the in-browser mock until the backend endpoints exist. On by default in
   * development; production builds use it only when VITE_USE_MOCKS=true is set explicitly.
   */
  useMocks: mocksFlag === undefined ? import.meta.env.DEV : mocksFlag === 'true',
  /**
   * The school name shown on the sign-in pages with mocks on. Against the real API the school at
   * this address (`<school>.edutrack.ng/teacher`) is read from `GET /v1/public/school`, and this is
   * only shown until it answers (see lib/school-brand.ts).
   */
  schoolName: import.meta.env.VITE_SCHOOL_NAME ?? 'Greenfield Academy',
} as const;
