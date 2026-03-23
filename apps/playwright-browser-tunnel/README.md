
# @rushstack/playwright-browser-tunnel

Run a Playwright browser server in one environment and drive it from another environment by forwarding Playwright’s WebSocket traffic through a tunnel.

This package is intended for remote development / CI scenarios (for example: Codespaces, devcontainers, or a separate “browser host” machine) where you want tests to run “here” but the actual browser process to run “there”.

## Relationship to the Playwright Local Browser Server VS Code extension

This package is the core tunneling/runtime layer used by the **Playwright Local Browser Server** VS Code extension (located at [vscode-extensions/playwright-local-browser-server-vscode-extension](../../vscode-extensions/playwright-local-browser-server-vscode-extension)).

In a typical Codespaces workflow:

- Your **tests** run inside the Codespace and call `tunneledBrowserConnection()`.
- `tunneledBrowserConnection()` starts a WebSocket server (by default on port `56767`) that a browser host can attach to.
- The VS Code extension runs on the **UI side** and starts a `PlaywrightTunnel` which connects to `ws://127.0.0.1:56767`.
	- In Codespaces, this works when port `56767` is forwarded to your local machine (VS Code port forwarding makes the remote port reachable as `localhost:56767`).
- Once connected, the extension hosts the actual Playwright browser process locally, while your tests continue to run remotely.

The extension provides a UI wrapper around this library (start/stop commands, status bar state, and logs), while `@rushstack/playwright-browser-tunnel` provides the underlying protocol forwarding and browser lifecycle management.

### Detecting whether the VS Code extension is present

Some remote test fixtures want to detect whether the **Playwright Local Browser Server** extension is installed/active (for example, to skip local-browser-only scenarios when the extension isn’t available).

The extension writes a marker file named `.playwright-local-browser-server-extension-installed.txt` into the remote environment’s `os.tmpdir()` using VS Code’s remote filesystem APIs.

On the remote side, `isExtensionInstalledAsync()` checks for that marker file and returns `true` if it exists:

```ts
import { isExtensionInstalledAsync } from '@rushstack/playwright-browser-tunnel';

if (!(await isExtensionInstalledAsync())) {
	throw new Error('Playwright Local Browser Server extension is not installed/active in this environment');
}
```


## Requirements

- Node.js `>= 20` (see `engines` in `package.json`)
- A compatible Playwright version (this package is built/tested with Playwright `1.56.x`)

## Exports

From [src/index.ts](src/index.ts):

- `PlaywrightTunnel` (class)
- `IPlaywrightTunnelOptions` (type)
- `TunnelStatus` (type)
- `BrowserNames` (type)
- `tunneledBrowserConnection()` (function)
- `tunneledBrowser()` (function)
- `IDisposableTunneledBrowserConnection` (type)
- `isExtensionInstalledAsync()` (function)

## Usage

There are two pieces:

1) **Browser host**: run a `PlaywrightTunnel` to launch the real browser server and forward messages.
2) **Test runner**: create a local endpoint via `tunneledBrowserConnection()` that your Playwright client can connect to (it forwards to the browser host).

### 1) Browser host: run the tunnel

Use `PlaywrightTunnel` in the environment where you want the browser process to run.

```ts
import { ConsoleTerminalProvider, Terminal, TerminalProviderSeverity } from '@rushstack/terminal';
import { PlaywrightTunnel } from '@rushstack/playwright-browser-tunnel';
import path from 'node:path';
import os from 'node:os';

const terminalProvider = new ConsoleTerminalProvider();
const terminal = new Terminal(terminalProvider);

const tunnel = new PlaywrightTunnel({
	mode: 'wait-for-incoming-connection',
	listenPort: 56767,
	tmpPath: path.join(os.tmpdir(), 'playwright-browser-tunnel'),
	terminal,
	onStatusChange: (status) => terminal.writeLine(`status: ${status}`)
});

await tunnel.startAsync({ keepRunning: true });
```

Notes:

- `mode: 'wait-for-incoming-connection'` starts a WebSocket server and waits for the other side to connect.
- `mode: 'poll-connection'` repeatedly attempts to connect to a WebSocket endpoint you provide (`wsEndpoint`).
- `tmpPath` is used as a working directory to install the requested `playwright-core` version and run its CLI.

### 2) Test runner: create a local endpoint to connect()

Use `tunneledBrowserConnection()` in the environment where your tests run.

It starts:

- a **remote** WebSocket server (port `56767`) that the browser host connects to
- a **local** WebSocket endpoint (random port) that your Playwright client connects to

```ts
import { tunneledBrowserConnection } from '@rushstack/playwright-browser-tunnel';
import playwright from 'playwright-core';

using connection = await tunneledBrowserConnection();

// Build the connect URL with query parameters consumed by the local proxy.
const url = new URL(connection.remoteEndpoint);
url.searchParams.set('browser', 'chromium');
url.searchParams.set('launchOptions', JSON.stringify({ headless: true }));

const browser = await playwright.chromium.connect(url.toString());
// ...run tests...
await browser.close();
```

## Development

- Build: `rush build --to playwright-browser-tunnel`
- Demo script (if configured): `rushx demo`

## Troubleshooting

- If the tunnel is stuck in `waiting-for-connection`, ensure the counterpart process is reachable and ports are forwarded correctly.
- If browser installation is slow/repeated, ensure `tmpPath` is stable and writable for the host environment.

