/** Typed access to build-time configuration. */
export const env = {
  apiUrl: import.meta.env.VITE_API_URL ?? '/api',
  /**
   * The school name shown on the sign-in pages until `GET /v1/public/school` answers for the
   * school at this address (`<school>.edutrack.ng/parent`); see lib/school-brand.ts.
   */
  schoolName: import.meta.env.VITE_SCHOOL_NAME ?? 'Your school',
} as const;
