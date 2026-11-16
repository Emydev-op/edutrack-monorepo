/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the EduTrack API, e.g. /api (same address as the page). */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
