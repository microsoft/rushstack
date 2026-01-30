# Playwright Local Browser Server VS Code Extension

Enables running Playwright tests in a remote VS Code environment (such as GitHub Codespaces) while launching and driving the actual browser process on your local machine.

This extension is a UI wrapper around the tunneling/runtime library [`@rushstack/playwright-browser-tunnel`](../../apps/playwright-browser-tunnel). It starts/stops the local browser host process and forwards Playwright’s WebSocket traffic between the remote test runner and your local browser.

## How it works

- Remote side (Codespace): your Playwright test fixture starts a WebSocket **tunnel server** on a well-known port (default `3000`) and a small local HTTP endpoint used by the Playwright client.
- Local side (your VS Code UI machine): this extension starts a `PlaywrightTunnel` in `poll-connection` mode and connects to the forwarded tunnel port.
- After a handshake (browser type, launch options, Playwright version), the extension installs the requested Playwright/browser as needed, launches a local `browserServer`, and begins bidirectional forwarding.

## Test fixture requirement

For this extension to work, your Playwright tests must use a custom fixture that starts the tunnel server on the remote side.

Use `tunneledBrowser()` from `@rushstack/playwright-browser-tunnel` inside your fixture’s `browser` override (so that the Playwright client in the remote environment connects through the tunnel).

Reference implementation: [apps/playwright-browser-tunnel/tests/testFixture.ts](../../apps/playwright-browser-tunnel/tests/testFixture.ts)

Example:

```ts
import { test as base } from '@playwright/test';
import { tunneledBrowser } from '@rushstack/playwright-browser-tunnel';

export const test = base.extend({
	browser: [
		async ({ browserName, launchOptions, channel, headless }, use) => {
			await using tunnel = await tunneledBrowser(browserName, {
				channel,
				headless,
				...launchOptions
			});

			await use(tunnel.browser);
		},
		{ scope: 'worker' }
	]
});
```

## How `extensionIsInstalled()` works with this extension

To help remote test code detect whether this extension is installed/active, the extension writes a marker file named `.playwright-local-browser-server-extension-installed.txt` into the remote environment’s `os.tmpdir()` when VS Code is connected to a remote workspace.

On the test (remote) side, you can call `extensionIsInstalled()` from `@rushstack/playwright-browser-tunnel`, which simply checks for that marker file:

```ts
import { extensionIsInstalled } from '@rushstack/playwright-browser-tunnel';

if (!(await extensionIsInstalled())) {
	throw new Error(
		'Playwright Local Browser Server VS Code extension not detected. Install/enable it and ensure VS Code is connected to the remote workspace.'
	);
}
```

## Full Sequence Diagram

```mermaid
sequenceDiagram
	participant PT as Playwright Tests
	participant BF as Browser Fixture
	participant TS as Tunnel Server (WebSocket)
	participant HS as HTTP Server
	participant VSC as VS Code Extension
	participant BS as Browser Server
	participant LB as Local Browser

	Note over PT,LB: Context:  Enables local browser testing for remote VS Code environments (e.g., Codespaces)

	PT->>BF:  Trigger custom browser fixture

	par Fixture Setup
		BF->>HS: Launch localhost HTTP server
		BF->>TS: Launch WebSocket tunnel server (well-known port)
	end

	BF->>HS: browser.connect('http://localhost:<port>? browser=chromium&launchOptions={}')

	loop Polling
		VSC->>TS: Poll for connection (well-known port)
	end

	TS-->>VSC: WebSocket connection established

	BF->>VSC: Send handshake (browser type, launchOptions, Playwright version)

	VSC->>VSC: Install requested Playwright version
	VSC->>VSC: Install requested browser

	VSC->>BS: Launch browserServer via Playwright API
	BS->>LB: Start local browser instance

	VSC->>BS: Create WebSocket client connection

	VSC->>TS: Send acknowledgement (ready to go)

	par Setup Forwarding
		Note over BF,TS:  Fixture:  PT ↔ Tunnel Server
		Note over VSC,BS: Extension: Tunnel Server ↔ Browser Server
	end

	BF->>BF:  Flush buffered messages from test

	rect rgb(200, 230, 200)
		Note over PT,LB:  Transparent bidirectional communication established
		PT->>BF:  Playwright commands
		BF->>TS: Forward to tunnel
		TS->>VSC: Forward to extension
		VSC->>BS: Forward to browser server
		BS->>LB: Execute in local browser
		LB-->>BS: Response
		BS-->>VSC: Forward response
		VSC-->>TS: Forward to tunnel
		TS-->>BF: Forward to fixture
		BF-->>PT: Return to test
	end

	Note over PT,LB: 🎉 Profit!  Local browser available to remote tests transparently
```

## Commands

This extension contributes the following commands:

- **Playwright: Start Playwright Browser Tunnel** (`playwright-tunnel.start`)
- **Playwright: Stop Playwright Browser Tunnel** (`playwright-tunnel.stop`)
- **Playwright Local Browser Server: Show Log** (`playwright-tunnel.showLog`)
- **Playwright Local Browser Server: Show Settings** (`playwright-tunnel.showSettings`)
- **Playwright Local Browser Server: Show Tunnel Menu** (`playwright-tunnel.showMenu`) — status bar menu

## Settings

- `playwright-tunnel.autoStart` (default: `true`) — automatically starts the tunnel when the extension activates.
- `playwright-tunnel.tunnelPort` (default: `3000`) — port used by the remote tunnel server.

## Notes

- The extension currently connects to `ws://127.0.0.1:3000` on the local machine. In Codespaces, make sure the remote port is forwarded so it is reachable as `localhost` from your VS Code UI environment.
- For the underlying API and examples, see [`@rushstack/playwright-browser-tunnel`](../../apps/playwright-browser-tunnel).
