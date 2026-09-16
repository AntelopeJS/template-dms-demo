// Schema owned by this template. Every table the template defines itself is
// registered under this schema via `@RegisterTable(_, DEMO_SCHEMA_NAME)` and
// provisioned by `RegisterSchema(DEMO_SCHEMA_NAME)` in the module `start()`
// (see src/index.ts) — instead of piggybacking on the DMS core schema.
export const DEMO_SCHEMA_NAME = "template-dms-demo";
