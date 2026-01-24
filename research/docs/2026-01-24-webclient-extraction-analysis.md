---
date: 2026-01-24 10:45:22 PST
researcher: Claude Code
git_commit: e53f643ad5846ba38059612088b7950a30493c20
branch: extract-web-client
repository: rushstack
topic: "WebClient usage in rush-lib and extraction impact analysis"
tags: [research, codebase, webclient, rush-lib, extraction, http-client]
status: complete
last_updated: 2026-01-24
last_updated_by: Claude Code
---

# Research: WebClient Extraction Analysis

## Research Question

How does WebClient get used in rush-lib and what would be the impact of extracting it to its own package?

## Summary

WebClient is an internal HTTP client utility class in `rush-lib` that provides a simplified interface for making HTTP/HTTPS requests with support for proxy detection, automatic decompression (gzip, deflate, brotli), and redirect handling. While not part of rush-lib's official public API, it is consumed by multiple Rush plugins via deep imports through `@rushstack/rush-sdk/lib/utilities/WebClient`.

**Key Findings:**
- WebClient is used internally by rush-lib for npm registry queries and Artifactory authentication
- Three Rush plugins depend on WebClient: `rush-amazon-s3-build-cache-plugin`, `rush-http-build-cache-plugin`, and (indirectly) `rush-azure-storage-build-cache-plugin`
- The `npm-check-fork` library has a TODO comment requesting WebClient extraction to avoid reimplementing HTTP logic
- Extraction would require minimal dependencies: `https-proxy-agent` and `@rushstack/node-core-library`
- The API surface is well-defined with 7 exported types/interfaces and a single class

## Detailed Findings

### WebClient Location and Structure

**Main Implementation File:**
- `libraries/rush-lib/src/utilities/WebClient.ts` (307 lines)

**Test Files:**
- `libraries/rush-lib/src/utilities/test/WebClient.test.ts` (56 lines)
- `libraries/rush-lib/src/utilities/test/__snapshots__/WebClient.test.ts.snap`

### Internal rush-lib Usage

WebClient is used in two internal contexts within rush-lib:

#### 1. BaseInstallManager.ts - NPM Registry Queries
**File:** `libraries/rush-lib/src/logic/base/BaseInstallManager.ts`

- **Purpose:** Checks if current Rush release is published on npm registry
- **Import Pattern:** Type import + dynamic import
  ```typescript
  import type { WebClient as WebClientType, IWebClientResponse } from '../../utilities/WebClient';
  // ...
  const { WebClient } = await import('../../utilities/WebClient');
  ```
- **API Used:**
  - `new WebClient()` (line 1081)
  - `webClient.userAgent` property (line 1082)
  - `webClient.accept` property (line 1083, 1108)
  - `webClient.fetchAsync(url)` (lines 1085, 1110)
  - `response.ok`, `response.status` (lines 1086, 1112-1113)
  - `response.getJsonAsync()` (line 1090-1091)

#### 2. SetupPackageRegistry.ts - Artifactory Token Fetch
**File:** `libraries/rush-lib/src/logic/setup/SetupPackageRegistry.ts`

- **Purpose:** Fetches NPM authentication tokens from Artifactory during `rush setup`
- **Import Pattern:** Type import + dynamic import
  ```typescript
  import type { WebClient as WebClientType, IWebClientResponse } from '../../utilities/WebClient';
  // ...
  const { WebClient } = await import('../../utilities/WebClient');
  ```
- **API Used:**
  - `new WebClient()` (line 292)
  - `webClient.addBasicAuthHeader(user, key)` (line 294)
  - `webClient.fetchAsync(url)` (line 308)
  - `response.ok`, `response.status`, `response.statusText` (lines 315-316)
  - `response.getTextAsync()` (line 330)

### External Usage (Outside rush-lib)

WebClient is consumed by Rush plugins via `@rushstack/rush-sdk/lib/utilities/WebClient`:

#### rush-amazon-s3-build-cache-plugin
**Directory:** `rush-plugins/rush-amazon-s3-build-cache-plugin`

| File | Usage |
|------|-------|
| `src/AmazonS3Client.ts` | Receives WebClient via constructor, calls `fetchAsync()` for S3 operations |
| `src/AmazonS3BuildCacheProvider.ts` | Creates `new WebClient()` instance |
| `src/test/AmazonS3Client.test.ts` | Uses `WebClient.prototype.fetchAsync` spy for testing |

**Exports Used:** `WebClient`, `IWebClientResponse`, `IGetFetchOptions`, `IFetchOptionsWithBody`, `AUTHORIZATION_HEADER_NAME`

#### rush-http-build-cache-plugin
**Directory:** `rush-plugins/rush-http-build-cache-plugin`

| File | Usage |
|------|-------|
| `src/HttpBuildCacheProvider.ts` | Creates WebClient, calls `fetchAsync()` for cache operations |
| `src/test/HttpBuildCacheProvider.test.ts` | Uses `WebClient.mockRequestFn()` and `WebClient.resetMockRequestFn()` |

**Exports Used:** `WebClient`, `IWebClientResponse`

#### rush-amazon-s3-build-cache-plugin-integration-test
**Directory:** `build-tests/rush-amazon-s3-build-cache-plugin-integration-test`

| File | Import Path | Usage |
|------|-------------|-------|
| `src/readObject.ts` | `@microsoft/rush-lib/lib/utilities/WebClient` | Creates WebClient for S3 integration tests |

### Potential Future Consumer: npm-check-fork

**File:** `libraries/npm-check-fork/src/NpmRegistryClient.ts`

Contains explicit TODO comment at lines 132-133:
```typescript
// TODO: Extract WebClient from rush-lib so that we can use it here
// instead of this reimplementation of HTTP request logic.
```

Currently reimplements HTTP request functionality using Node.js `http`/`https` modules directly with:
- Manual proxy handling
- gzip/deflate decompression via `zlib`
- Timeout management
- Error handling

This is duplicated logic that WebClient already provides.

### WebClient Public API

#### Exported Types and Interfaces

| Export | Description |
|--------|-------------|
| `IWebClientResponse` | Response interface with `ok`, `status`, `headers`, and async body getters |
| `IWebFetchOptionsBase` | Base options: `timeoutMs`, `headers`, `redirect`, `noDecode` |
| `IGetFetchOptions` | GET request options (extends base) |
| `IFetchOptionsWithBody` | PUT/POST/PATCH options with `body` |
| `WebClientProxy` | Enum: `None`, `Detect`, `Fiddler` |
| `IRequestOptions` | Combined request options (internal) |
| `FetchFn` | Type for the fetch function signature |
| `AUTHORIZATION_HEADER_NAME` | Constant `'Authorization'` |

#### WebClient Class

**Properties:**
| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `standardHeaders` | `Record<string, string>` | `{}` | Headers applied to all requests |
| `accept` | `string \| undefined` | `'*/*'` | Accept header value |
| `userAgent` | `string \| undefined` | `'rush node/...'` | User-Agent header |
| `proxy` | `WebClientProxy` | `Detect` | Proxy configuration |

**Static Methods:**
| Method | Signature | Description |
|--------|-----------|-------------|
| `mockRequestFn` | `(fn: FetchFn): void` | Replaces request function for testing |
| `resetMockRequestFn` | `(): void` | Restores default request function |
| `mergeHeaders` | `(target, source): void` | Merges headers objects |

**Instance Methods:**
| Method | Signature | Description |
|--------|-----------|-------------|
| `addBasicAuthHeader` | `(userName, password): void` | Adds Basic auth header |
| `fetchAsync` | `(url, options?): Promise<IWebClientResponse>` | Performs HTTP request |

### Dependencies for Extraction

#### Required npm Dependencies
| Package | Version | Purpose |
|---------|---------|---------|
| `https-proxy-agent` | `~5.0.0` | HTTP/HTTPS proxy support |
| `@rushstack/node-core-library` | `workspace:*` | `Import.lazy()` and `LegacyAdapters.convertCallbackToPromise()` |

#### Node.js Built-in Modules (no packages needed)
- `node:os` - Platform info for User-Agent
- `node:process` - Environment variables (`HTTPS_PROXY`, `HTTP_PROXY`)
- `node:http` - HTTP request function
- `node:https` - HTTPS request function
- `node:zlib` - Response decompression (dynamically imported)

### Extraction Impact Analysis

#### Breaking Changes

1. **Import Path Changes:**
   - Current: `@rushstack/rush-sdk/lib/utilities/WebClient`
   - New: `@rushstack/web-client` (or similar)

2. **Affected Packages:**
   - `rush-amazon-s3-build-cache-plugin` - Must update imports
   - `rush-http-build-cache-plugin` - Must update imports
   - `rush-amazon-s3-build-cache-plugin-integration-test` - Must update imports

3. **API Compatibility:**
   - The public API surface should remain unchanged
   - Static mock methods should be preserved for test compatibility

#### Benefits of Extraction

1. **Code Reuse:** `npm-check-fork` can use WebClient instead of reimplementing HTTP logic
2. **Reduced Bundle Size:** Rush plugins would depend on a smaller focused package
3. **Cleaner Separation:** HTTP client concerns separated from Rush orchestration logic
4. **Easier Testing:** Dedicated package can have more focused tests
5. **Independent Versioning:** HTTP client changes don't require rush-lib version bump

#### Migration Path

1. Create new package `@rushstack/web-client` (or similar name)
2. Copy WebClient implementation with its tests
3. Update rush-lib to import from new package (internal usage)
4. Update rush-sdk to re-export from new package (maintains backward compatibility)
5. Update Rush plugins to import from new package
6. Update npm-check-fork to use new package
7. Deprecate deep import path in documentation

#### Backward Compatibility Strategy

The `@rushstack/rush-sdk/lib/utilities/WebClient` path could continue to work by having rush-sdk re-export from the new package:

```typescript
// In rush-sdk/lib/utilities/WebClient.js
export * from '@rushstack/web-client';
```

This maintains compatibility with existing Rush plugins during transition.

## Code References

- `libraries/rush-lib/src/utilities/WebClient.ts` - Main WebClient implementation
- `libraries/rush-lib/src/utilities/test/WebClient.test.ts` - Unit tests
- `libraries/rush-lib/src/logic/base/BaseInstallManager.ts:1079-1121` - NPM registry query usage
- `libraries/rush-lib/src/logic/setup/SetupPackageRegistry.ts:283-360` - Artifactory token usage
- `rush-plugins/rush-amazon-s3-build-cache-plugin/src/AmazonS3Client.ts` - S3 plugin usage
- `rush-plugins/rush-http-build-cache-plugin/src/HttpBuildCacheProvider.ts` - HTTP cache plugin usage
- `libraries/npm-check-fork/src/NpmRegistryClient.ts:132-133` - TODO comment for extraction

## Architecture Documentation

### Current Import Pattern

```
rush-lib (internal)
└── utilities/WebClient.ts (definition)
    ├── logic/base/BaseInstallManager.ts (dynamic import)
    └── logic/setup/SetupPackageRegistry.ts (dynamic import)

rush-sdk
└── lib/utilities/WebClient.js (re-export via _rushSdk_loadInternalModule)

Rush Plugins (via rush-sdk)
├── rush-amazon-s3-build-cache-plugin
├── rush-http-build-cache-plugin
└── rush-azure-storage-build-cache-plugin (indirectly via S3 plugin patterns)
```

### Proposed Extraction Architecture

```
@rushstack/web-client (NEW)
└── src/WebClient.ts (moved from rush-lib)

rush-lib
└── Re-export or import from @rushstack/web-client

rush-sdk
└── lib/utilities/WebClient.js (re-export from @rushstack/web-client for backward compat)

Rush Plugins
└── Direct import from @rushstack/web-client

npm-check-fork
└── Direct import from @rushstack/web-client (replaces NpmRegistryClient HTTP logic)
```

## Open Questions

1. **Package Naming:** Should the new package be `@rushstack/web-client`, `@rushstack/http-client`, or something else?

2. **API Surface:** Should the extracted package expose additional functionality (e.g., streaming responses) or maintain minimal API?

3. **Proxy Configuration:** Should proxy detection be enhanced in the extracted package?

4. **Test Mocking:** The current `mockRequestFn` pattern is used by plugin tests. Should a more formal testing interface be designed?

5. **rush-sdk Compatibility:** How long should the `@rushstack/rush-sdk/lib/utilities/WebClient` re-export be maintained?

6. **npm-check-fork Migration:** Should npm-check-fork migration be part of the initial extraction PR or follow-up work?
