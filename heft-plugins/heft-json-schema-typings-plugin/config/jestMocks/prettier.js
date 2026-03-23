// Stub for prettier.  json-schema-to-typescript eagerly require('prettier') at
// module load time.  Prettier v3's CJS entry does a top-level dynamic import()
// which crashes inside Jest's VM sandbox on Node 22+.  Since compile() is called
// with format: false, prettier is never invoked — this stub just prevents the
// module-load crash.
module.exports = {};
