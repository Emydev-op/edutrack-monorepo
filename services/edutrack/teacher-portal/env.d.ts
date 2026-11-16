/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the EduTrack API, e.g. http://localhost:8000/api */
  readonly VITE_API_URL: string;
  /** "true" serves every API call from the in-browser mock until the backend endpoints exist. */
  readonly VITE_USE_MOCKS?: string;
  /** School name on the sign-in pages with mocks on; the real API names the school otherwise. */
  readonly VITE_SCHOOL_NAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
