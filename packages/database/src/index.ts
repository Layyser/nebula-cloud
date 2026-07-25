/**
 * Minimal lifecycle contract for the future PostgreSQL adapter.
 * Schema and driver choices remain deferred to CLOUD-02.
 */
export interface CloudDatabase {
  ping(): Promise<void>
  close(): Promise<void>
}
