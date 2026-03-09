// Polyfill globalThis.crypto for Node 18, which doesn't expose it by default.
// This is needed by serialize-javascript, which calls crypto.randomBytes() at module load time.
// All Node 18 versions have node:crypto (the module)
// All Node 18 versions have globalThis.crypto (but it's the limited Web Crypto API)
// The bug is that serialize-javascript@7.0.3 assumes globalThis.crypto.randomBytes() exists,
// which only works in Node 20+ where the global was enhanced
if (!globalThis.crypto) {
  const { webcrypto } = require('node:crypto');
  globalThis.crypto = webcrypto;
}
