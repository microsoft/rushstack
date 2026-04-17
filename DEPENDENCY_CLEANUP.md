# Dependency Cleanup Tracking

## Completed removals

- [x] **`@ungap/structured-clone`** (`heft-config-file`) — Replaced with native `structuredClone` (Node 18+).
- [x] **`glob-escape`** (`rush-lib`) — Replaced with `fast-glob`'s built-in `escapePath` (already a dep).
- [x] **`strip-json-comments`** (`rig-package`) — Replaced with `jju.parse()` (same package `node-core-library` uses).
- [x] **`figures`** (`rush-lib`) — Replaced with a named `const POINTER = '\u276F'`.
- [x] **`open`** (`lockfile-explorer`) — Replaced with `Executable.spawn()` from `node-core-library`.
- [x] **`update-notifier`** (`lockfile-explorer`) — Removed entirely.
- [x] **`builtin-modules`** (`rush-lib`) — Replaced with `module.isBuiltin()` (Node 18+).
- [x] **`giturl`** (`npm-check-fork`) — Replaced with original `toHttpsUrl()` implementation using native `URL` class.
- [x] **`scheduler@0.19.0`** (`rush-vscode-command-webview`) — Explicit pin removed; `0.27.0` (transitive via react-dom) satisfies the `>=0.19.0` peer dep range.

---

## Full third-party dependency census

R = runtime `dependencies` · D = dev-only `devDependencies`

Scope: all packages under `apps/`, `libraries/`, `heft-plugins/`, `rigs/`, `rush-plugins/`, `vscode-extensions/`, `webpack/`, `repo-scripts/`. Excludes `build-tests/`, `common/`, `node_modules/`, and internal `@rushstack/` / `workspace:*` cross-refs.

---

### JSON & Configuration

| Package | Ver | R/D | Used by | Purpose |
|---|---|---|---|---|
| `jju` | ~1.4.0 | R | node-core-library, rig-package | Lenient JSONC parsing (JSON with comments) |
| `ajv` | ~8.18.0 | R | node-core-library | JSON Schema validation |
| `ajv-draft-04` | ~1.0.0 | R | node-core-library | Draft-04 JSON Schema support for ajv |
| `ajv-formats` | ~3.0.1 | R | node-core-library | Format validators (date, email, …) for ajv |
| `js-yaml` | ~4.1.0 | R | api-documenter, api-extractor, lockfile-explorer, doc-plugin-rush-stack | YAML parsing/serialization |
| `jsonpath-plus` | ~10.3.0 | R | heft-config-file | JSONPath expression evaluation in config files |

### File System & Paths

| Package | Ver | R/D | Used by | Purpose |
|---|---|---|---|---|
| `fs-extra` | ~11.3.0 | R | node-core-library | Extended FS ops: copy, remove, ensureDir |
| `resolve` | ~1.22.1 | R | node-core-library, api-extractor, api-documenter, trace-import, rig-package | Node module resolution algorithm |
| `ignore` | ~5.1.6 | R | rush-lib, heft, package-extractor | Gitignore-style file pattern matching |
| `true-case-path` | ~2.2.1 | R | rush-lib | Resolves correct case-sensitive paths on Windows |
| `fast-glob` | ~3.3.1 | R | heft, rush-lib, package-extractor, typings-generator, hashed-folder-copy-plugin | Fast glob pattern matching |
| `minimatch` | 10.2.3 | R | api-extractor, package-extractor, webpack4-localization-plugin | Glob-to-regex pattern matching |
| `chokidar` | ~3.6.0 | R | typings-generator | File watching |

### Versioning & Package Resolution

| Package | Ver | R/D | Used by | Purpose |
|---|---|---|---|---|
| `semver` | ~7.5.4 | R | node-core-library, rush-lib, api-extractor, ts-command-line, trace-import, various | Version comparison and range parsing |
| `npm-package-arg` | ~6.1.0 | R | rush-lib | Parses npm package specifier strings |
| `read-package-tree` | ~5.1.5 | R | rush-lib | Reads npm package tree structure |
| `npm-packlist` | ~5.1.3 | R | package-extractor | Determines which files go into an npm package |
| `dependency-path` | ~9.2.8 | R | rush-lib | Parses pnpm-style dependency paths |
| `@pnpm/link-bins` | ~5.3.7 | R | rush-lib, package-extractor | Creates symlinks for executable bins |
| `@pnpm/dependency-path` | varies | R | rush-pnpm-kit-v8/v9/v10 | pnpm dependency path handling (version-specific) |
| `@pnpm/lockfile.*` | varies | R | rush-pnpm-kit-v8/v9/v10 | pnpm lockfile parsing (version-specific) |
| `@pnpm/logger` | varies | R | rush-pnpm-kit-v8/v9/v10 | Logging for pnpm operations |
| `@yarnpkg/lockfile` | ~1.0.2 | R | rush-lib | Parses Yarn lock files |
| `ssri` | ~8.0.0 | R | rush-lib | Subresource Integrity hash handling |
| `object-hash` | 3.0.0 | R | rush-lib | Deterministic object hashing for dependency tracking |
| `import-lazy` | ~4.0.0 | R | node-core-library | Lazy module loading to improve startup time |

### CLI & User Interaction

| Package | Ver | R/D | Used by | Purpose |
|---|---|---|---|---|
| `argparse` | ~1.0.9 | R | ts-command-line | Argument parsing engine |
| `inquirer` | ~8.2.7 | R | rush-lib | Interactive CLI prompts |
| `cli-table` | ~0.3.1 | R | rush-lib | ASCII table formatting in CLI output |
| `string-argv` | ~0.3.1 | R | ts-command-line, rundown, playwright-browser-tunnel | Parses command-line strings into argv arrays |

### Web & Networking

| Package | Ver | R/D | Used by | Purpose |
|---|---|---|---|---|
| `express` | 4.21.1 | R | lockfile-explorer, rush-serve-plugin | HTTP server framework |
| `cors` | ~2.8.5 | R | lockfile-explorer, rush-serve-plugin | CORS middleware for Express |
| `ws` | ~8.14.1 | R | playwright-browser-tunnel, rush-serve-plugin | WebSocket implementation |
| `https-proxy-agent` | ~5.0.0 | R | rush-lib, rush-amazon-s3-build-cache-plugin, rush-http-build-cache-plugin | HTTPS proxy support for network requests |
| `compression` | ~1.7.4 | R | rush-serve-plugin | HTTP response compression middleware |
| `http2-express-bridge` | ~1.0.7 | R | rush-serve-plugin | Bridges Express to HTTP/2 server |

### Cloud Storage & Auth

| Package | Ver | R/D | Used by | Purpose |
|---|---|---|---|---|
| `@azure/identity` | ~4.13.1 | R | rush-azure-storage-build-cache-plugin | Azure authentication credentials |
| `@azure/storage-blob` | ~12.31.0 | R | rush-azure-storage-build-cache-plugin | Azure Blob Storage client (build cache) |
| `@redis/client` | ~5.8.2 | R | rush-redis-cobuild-plugin | Redis client for distributed cobuild lock provider |

### Build & Bundling

| Package | Ver | R/D | Used by | Purpose |
|---|---|---|---|---|
| `webpack-dev-server` | ^5.1.0 | R | heft-webpack5-plugin | Dev server for Webpack 5 |
| `watchpack` | 2.4.0 | R | heft, heft-webpack5-plugin, heft-rspack-plugin | File watching for incremental rebuilds |
| `tapable` | 1.1.3 / 2.x | R | heft, heft-typescript-plugin, heft-webpack5-plugin, heft-rspack-plugin, rush-sdk, webpack4-module-minifier-plugin, webpack5-module-minifier-plugin | Webpack-style plugin/hook system |
| `@rspack/dev-server` | ^1.1.4 | R | heft-rspack-plugin | Dev server for Rspack bundler |
| `webpack-merge` | ~5.8.0 | R | webpack-plugin-utilities | Merges webpack configurations in test utilities |
| `memfs` | 4.12.0 | R | webpack-plugin-utilities | In-memory filesystem for testing webpack plugins |
| `loader-utils` | 1.4.2 | R | loader-load-themed-styles, loader-raw-script, webpack4-localization-plugin | Webpack loader utilities (extract options from loader context) |

### Code Transformation

| Package | Ver | R/D | Used by | Purpose |
|---|---|---|---|---|
| `terser` | ^5.9.0 | R | module-minifier | JavaScript minification |
| `source-map` | ~0.6.1 / ~0.7.3 | R | api-extractor, module-minifier | Source map generation and parsing |
| `serialize-javascript` | 7.0.5 | R | module-minifier | Safe serialization of JavaScript values |

### CSS & Styling

| Package | Ver | R/D | Used by | Purpose |
|---|---|---|---|---|
| `postcss` | ~8.4.6 | R | heft-sass-plugin | CSS transformation framework |
| `postcss-modules` | ~6.0.0 | R | heft-sass-plugin | CSS Modules support |
| `sass-embedded` | ~1.85.1 | R | heft-sass-plugin | Embedded Sass compiler |

### Jest / Testing Infrastructure

| Package | Ver | R/D | Used by | Purpose |
|---|---|---|---|---|
| `@jest/core` | ~30.3.0 | R | heft-jest-plugin | Jest test runner core |
| `@jest/reporters` | ~30.3.0 | R | heft-jest-plugin | Jest test reporters |
| `@jest/transform` | ~30.3.0 | R | heft-jest-plugin | Jest file transformation pipeline |
| `jest-config` | ~30.3.0 | R | heft-jest-plugin | Jest configuration loading |
| `jest-resolve` | ~30.3.0 | R | heft-jest-plugin | Jest module resolution |
| `jest-snapshot` | ~30.3.0 | R | heft-jest-plugin | Jest snapshot testing |

### Utilities

| Package | Ver | R/D | Used by | Purpose |
|---|---|---|---|---|
| `supports-color` | ~8.1.1 | R | terminal | Detects terminal color support |
| `pseudolocale` | ~1.1.0 | R | localization-utilities | Generates pseudo-localized strings for testing |
| `xmldoc` | ~1.1.2 | R | localization-utilities | XML parsing and manipulation |
| `node-forge` | ~1.4.0 | R | debug-certificate-manager | TLS/SSL certificate generation |
| `giturl` | ^2.0.0 | R | npm-check-fork | Parses git URLs in package specs |
| `git-repo-info` | ~2.1.0 | R | heft, rush-lib | Reads git repository metadata |
| `json-stable-stringify-without-jsonify` | 1.0.1 | R | heft-lint-plugin | Deterministic JSON stringification |
| `tar` | ~7.5.6 | R | rush-lib | Tar archive creation/extraction |
| `dotenv` | ~16.4.7 | R | rush-lib | Loads `.env` files into environment variables |
| `tslib` | ~2.8.1 | R | lockfile-explorer, lockfile-explorer-web, debug-certificate-manager, playwright-local-browser-server-vscode-extension | TypeScript runtime helpers |
| `diff` | ~8.0.2 | R | repo-toolbox | Diff comparison for README generation |

### React / Web UI

| Package | Ver | R/D | Used by | Purpose |
|---|---|---|---|---|
| `react` | ~19.2.3 | R | lockfile-explorer-web, rush-themed-ui, rush-vscode-command-webview | React framework |
| `react-dom` | ~19.2.3 | R | lockfile-explorer-web, rush-themed-ui, rush-vscode-command-webview | React DOM rendering |
| `@reduxjs/toolkit` | ~2.11.2 | R | lockfile-explorer-web, rush-vscode-command-webview | Redux state management toolkit |
| `react-redux` | ~9.2.0 | R | lockfile-explorer-web, rush-vscode-command-webview | React-Redux bindings |
| `redux` | ~5.0.1 | R | lockfile-explorer-web, rush-vscode-command-webview | Redux state container |
| `prism-react-renderer` | ~2.4.1 | R | lockfile-explorer-web | Syntax-highlighted code rendering |
| `react-hook-form` | ~7.69.0 | R | rush-vscode-command-webview | Form handling for parameter forms in command webview |
| ~~`scheduler`~~ | ~~0.19.0~~ | ~~R~~ | ~~rush-vscode-command-webview~~ | ~~React internal task scheduler (explicit pin removed; transitive via react-dom)~~ |
| `@fluentui/react-components` | ~9.72.9 | R | rush-vscode-command-webview | Fluent UI React v9 components for VS Code webview |
| `@fluentui/react` | ~8.125.3 | R | rush-vscode-command-webview | Fluent UI React v8 (additional UI components) |
| `playwright-core` | ~1.56.1 | R | playwright-local-browser-server-vscode-extension | Playwright browser automation (browser tunnel) |

### AI / MCP

| Package | Ver | R/D | Used by | Purpose |
|---|---|---|---|---|
| `@modelcontextprotocol/sdk` | ~1.10.2 | R | rush-mcp-server | Model Context Protocol SDK |
| `zod` | ~3.25.76 | R | rush-mcp-server | TypeScript-first schema validation |

---

## Further elimination candidates

| Package | Rationale |
|---|---|
| `xmldoc` | Only in `localization-utilities`; could evaluate replacing with a lighter parser or native DOM |
| `inquirer` | Heavy interactive prompt library in `rush-lib`; could be replaced with Node `readline` for simple cases |
| `cli-table` | Very old (0.3.x) in `rush-lib`; could be replaced with a maintained alternative or custom formatter |
| `loader-utils` | Webpack 1.x-era utility; webpack4 loaders that use it may have native alternatives in their webpack version |
| `@fluentui/react` (v8) | `rush-vscode-command-webview` has both v8 and v9 Fluent UI; worth investigating if v8 can be dropped |
