/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the EduTrack API, e.g. http://localhost:3000/api */
  readonly VITE_API_URL: string;
  /** Fixed tenant (school) id for local development. */
  readonly VITE_TENANT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
