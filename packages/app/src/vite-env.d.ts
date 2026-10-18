/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set when this build is the old address: where the app has moved to. The projects screen then says so. */
  readonly VITE_MOVED_TO?: string;
}
