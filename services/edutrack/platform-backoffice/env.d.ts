/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the EduTrack API, e.g. http://localhost:3000/api */
  readonly VITE_API_URL: string;
  /** "true" serves every API call from the in-browser mock until the backend endpoints exist. */
  readonly VITE_USE_MOCKS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
