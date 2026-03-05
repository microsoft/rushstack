# Plan: Enable Storage State Reading in PlaywrightBrowserTunnel

## Background

Currently, `PlaywrightTunnel` launches a bare browser **server** via `browserType.launchServer(options)` and proxies WebSocket traffic to the test runner (codespace). The test runner client (via `playwright[browser].connect(wsEndpoint)`) then creates its own contexts. There is no mechanism to inject a pre-saved Playwright **storage state** (cookies, localStorage, sessionStorage) into the browser context.

Playwright's `storageState` is a property of `browser.newContext(options)`, not of `launchServer()`. In `remoteEndpoint` mode the codespace side cannot correctly create a context with storage state. Therefore, this must be done **on the browser host** inside `PlaywrightBrowserTunnel`, where the actual browser process runs.

**Scope:** Only `PlaywrightBrowserTunnel.ts` is modified. No changes to TunneledBrowser, TunneledBrowserConnection, or the handshake protocol.

---

## Approach

After `launchServer()` creates the browser process, the tunnel will use Playwright's `connect()` API to obtain a local `Browser` handle to the same process, then call `browser.newContext({ storageState })` to pre-seed a context with cookies/localStorage/sessionStorage. This context lives in the browser process and is available to the remote client that connects through the tunnel.

---

## Changes (all in `PlaywrightBrowserTunnel.ts`)

### 1. Import `Browser` and `BrowserContext` types

**Location:** Line 7

Add `Browser` and `BrowserContext` to the existing `playwright-core` type import:

```ts
// Before
import type { BrowserServer, BrowserType, LaunchOptions } from 'playwright-core';

// After
import type { Browser, BrowserContext, BrowserServer, BrowserType, LaunchOptions } from 'playwright-core';
```

### 2. Add `storageStatePath` to `IPlaywrightTunnelOptions`

**Location:** ~Line 62 (inside the options type)

Add an optional property for the path to a saved storage state JSON file:

```ts
export type IPlaywrightTunnelOptions = {
  terminal: ITerminal;
  onStatusChange: (status: TunnelStatus) => void;
  playwrightInstallPath: string;
  onBeforeLaunch?: (handshake: IHandshake) => Promise<boolean> | boolean;
  /**
   * Optional path to a saved Playwright storage state JSON file.
   * If provided, a browser context will be created with the storage state
   * applied when the browser server is launched. The file should contain
   * a JSON object with `cookies` and/or `origins` arrays as produced
   * by `browserContext.storageState()`.
   */
  storageStatePath?: string;
} & ( ... );
```

### 3. Store the path as a private field

**Location:** ~Line 97 (class fields) and ~Line 108 (constructor)

Add a new private readonly field and assign it in the constructor:

```ts
// Field declaration
private readonly _storageStatePath: string | undefined;

// In constructor, destructure and assign
const { mode, terminal, onStatusChange, playwrightInstallPath, onBeforeLaunch } = options;
this._storageStatePath = options.storageStatePath;
```

### 4. Expand `IBrowserServerProxy` interface

**Location:** ~Line 81

Add an optional reference to the locally-connected `Browser` so it can be cleaned up on close:

```ts
interface IBrowserServerProxy {
  browserServer: BrowserServer;
  client: WebSocket;
  /**
   * Local browser connection used to seed the storage state context.
   * Must be closed when the tunnel shuts down.
   */
  localBrowser?: Browser;
}
```

### 5. Read & apply storage state in `_getPlaywrightBrowserServerProxyAsync`

**Location:** ~Line 396 (after `launchServer()` call, before returning)

After launching the browser server, if `_storageStatePath` is set, connect locally and create a context with the storage state:

```ts
const browserServer: BrowserServer = await browsers[browserName].launchServer(safeOptions);

if (!browserServer) {
  throw new Error(
    `Failed to launch browser server for ${browserName} with options: ${JSON.stringify(safeOptions)}`
  );
}

terminal.writeLine(`Launched ${browserName} browser server`);

// Apply saved storage state if configured
let localBrowser: Browser | undefined;
if (this._storageStatePath) {
  terminal.writeLine(`Reading storage state from: ${this._storageStatePath}`);
  try {
    const storageStateContent: string = await FileSystem.readFileAsync(this._storageStatePath);
    const storageState: object = JSON.parse(storageStateContent);

    // Connect locally to seed the browser process with a storage-state context
    localBrowser = await browsers[browserName].connect(browserServer.wsEndpoint());
    const _context: BrowserContext = await localBrowser.newContext({
      storageState: storageState as any
    });
    terminal.writeLine('Browser context created with storage state successfully');
  } catch (error) {
    terminal.writeWarningLine(
      `Failed to apply storage state: ${getNormalizedErrorString(error)}. Continuing without it.`
    );
  }
}

const client: WebSocket = new WebSocket(browserServer.wsEndpoint());

return {
  browserServer,
  client,
  localBrowser
};
```

This is **non-fatal** — if the file is missing, unreadable, or has invalid JSON, a warning is logged and the tunnel proceeds normally without storage state.

### 6. Clean up the local browser connection on close

**Location:** ~Line 522-555 (`_initPlaywrightBrowserTunnelAsync`)

Track the `localBrowser` reference and close it during the WebSocket `close` handler:

```ts
// Add alongside existing variables at the top of the method
let localBrowser: Browser | undefined = undefined;

// After getting browserServerProxy (in the message handler):
client = browserServerProxy.client;
browserServer = browserServerProxy.browserServer;
localBrowser = browserServerProxy.localBrowser;

// In the ws 'close' handler, close localBrowser before browserServer:
if (localBrowser) {
  this._terminal.writeLine('  Closing local browser connection...');
  await localBrowser.close();
  this._terminal.writeLine('  Local browser connection closed');
}
if (browserServer) {
  this._terminal.writeLine('  Closing browser server...');
  await browserServer.close();
  this._terminal.writeLine('  Browser server closed');
}
```

---

## Files Changed

| File | Change |
|------|--------|
| `PlaywrightBrowserTunnel.ts` | Import `Browser`/`BrowserContext`, add `storageStatePath?` to options, store as field, expand `IBrowserServerProxy`, read file + create context in `_getPlaywrightBrowserServerProxyAsync`, clean up local browser on close |

**No changes** to TunneledBrowser, TunneledBrowserConnection, ITunneledBrowserConnection, ITunneledBrowser, or any handshake protocol types.

---

## ⚠️ Critical Issue: Local Browser Context Is Not Shared

**The approach of connecting locally and creating a context with storage state does not work with Playwright's connection model.**

In Playwright's architecture:
- Each `browser.connect()` call creates an **independent client session**
- Contexts created by one client are **invisible** to other clients connecting to the same `BrowserServer`
- When a client connection closes, **all contexts it created are destroyed**

This means:
1. If `localBrowser` is closed immediately after seeding → the context is destroyed
2. Even if `localBrowser` stays open → the remote client connecting through the tunnel gets a fresh session with **no access** to the locally-created context

### Viable Alternatives

#### Alternative A: Intercept CDP Messages (tunnel-side only)

The tunnel already forwards all WebSocket messages between the remote client and browser server. It could:
- Watch for `Browser.newContext` CDP calls in the forwarded traffic
- Inject or merge the `storageState` parameter into the call before forwarding it to the browser server
- Read the storage state file once at startup and hold it in memory

**Pros:** No changes to TunneledBrowser; fully transparent to the remote client
**Cons:** Fragile — depends on Playwright's internal CDP protocol structure, which is not a public API and may change between versions

#### Alternative B: Send Storage State in Handshake Ack (requires TunneledBrowser change)

- Read the storage state file on the browser host
- Include its contents in the `handshakeAck` message
- The codespace side applies it when calling `newContext()`

**Pros:** Clean, uses Playwright's public API
**Cons:** Requires modifying TunneledBrowser (ruled out per constraints)

#### ~~Alternative C: Use `--user-data-dir` Launch Option~~ ❌ NOT VIABLE

~~Pre-seed cookies/localStorage into a Chromium user data directory and pass `--user-data-dir=<path>` via `launchOptions.args`.~~

**Why it doesn't work:** Playwright explicitly rejects `--user-data-dir` in `launch()` and `launchServer()` args, throwing an error that says to use `browserType.launchPersistentContext()` instead. However, `launchPersistentContext()` returns a `BrowserContext` — not a `BrowserServer` — so it is incompatible with the tunnel's server model that requires `launchServer()` → `BrowserServer` → `wsEndpoint()`.

#### Alternative D: Expose Storage State via a Sideband HTTP Endpoint

- The browser host reads the storage state file and serves its contents over a simple HTTP endpoint (or includes it as metadata in a new tunnel protocol message type)
- The test code on the codespace side fetches the storage state and passes it to `newContext()` explicitly

**Pros:** No changes to the core TunneledBrowser connection code; clean separation
**Cons:** Requires test code to be aware of the sideband endpoint; not fully transparent

### Recommendation

**Alternative A (CDP interception)** is the most viable approach that keeps TunneledBrowser untouched and is transparent to test code. However, it couples the implementation to Playwright's internal protocol.

If the constraint against modifying TunneledBrowser can be relaxed, **Alternative B** is the cleanest solution.

---

## Design Decisions

### Why `IPlaywrightTunnelOptions` (not the handshake)?

The `storageStatePath` is a **local file** on the browser host machine. It's a trusted configuration value set by the extension, not something received from the remote test runner. This avoids path traversal security concerns and keeps the handshake protocol unchanged.

### Graceful degradation

If the storage state file doesn't exist, is malformed, or context creation fails:
- A warning is logged
- The tunnel proceeds normally without storage state
- No error is thrown

### Storage state file format

Playwright's `storageState` JSON has the shape `{ cookies: [...], origins: [...] }` as produced by `browserContext.storageState()`. Playwright itself validates the structure when passed to `newContext()`, so no additional schema validation is needed — any errors are caught by the try/catch.
