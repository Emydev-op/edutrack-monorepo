/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the EduTrack API, e.g. http://localhost:8000/api */
  readonly VITE_API_URL: string;
  /** School name on the sign-in pages until the API answers (GET /v1/public/school). */
  readonly VITE_SCHOOL_NAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
