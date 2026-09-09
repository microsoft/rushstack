const assert = require('node:assert/strict');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const test = require('node:test');
const { WebSocketServer } = require('ws');

const { PlaywrightTunnel } = require('../lib-commonjs/index.js');

function createTerminal() {
  return {
    writeLine() {},
    writeWarningLine() {},
    writeErrorLine() {},
    writeDebugLine() {}
  };
}

async function createUnusedWsEndpointAsync() {
  const server = new WebSocketServer({ port: 0 });
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return `ws://127.0.0.1:${port}`;
}

async function settledWithinAsync(promise, milliseconds) {
  let settled = false;
  promise.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    }
  );
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
  return settled;
}

test('stopAsync settles while waiting for a connection', async () => {
  const tunnel = new PlaywrightTunnel({
    mode: 'poll-connection',
    wsEndpoint: await createUnusedWsEndpointAsync(),
    terminal: createTerminal(),
    playwrightInstallPath: mkdtempSync(join(tmpdir(), 'rushstack-playwright-browser-tunnel-')),
    onStatusChange() {}
  });

  const startPromise = tunnel.startAsync();
  assert.equal(tunnel.status, 'waiting-for-connection');

  const stopPromise = tunnel.stopAsync();
  assert.equal(await settledWithinAsync(stopPromise, 250), true);
  assert.equal(tunnel.status, 'stopped');
  assert.equal(await settledWithinAsync(startPromise, 250), true);

  const restartPromise = tunnel.startAsync();
  assert.equal(tunnel.status, 'waiting-for-connection');

  const restartStopPromise = tunnel.stopAsync();
  assert.equal(await settledWithinAsync(restartStopPromise, 250), true);
  assert.equal(await settledWithinAsync(restartPromise, 250), true);
});

test('stopAsync closes an active websocket connection', async () => {
  const server = new WebSocketServer({ port: 0 });
  await new Promise((resolve) => server.once('listening', resolve));

  const connectionPromise = new Promise((resolve) => server.once('connection', resolve));
  const closePromise = new Promise((resolve) => {
    server.once('connection', (ws) => ws.once('close', resolve));
  });

  const { port } = server.address();
  const tunnel = new PlaywrightTunnel({
    mode: 'poll-connection',
    wsEndpoint: `ws://127.0.0.1:${port}`,
    terminal: createTerminal(),
    playwrightInstallPath: mkdtempSync(join(tmpdir(), 'rushstack-playwright-browser-tunnel-')),
    onStatusChange() {}
  });

  const startPromise = tunnel.startAsync();
  assert.equal(tunnel.status, 'waiting-for-connection');
  await connectionPromise;

  const stopPromise = tunnel.stopAsync();
  assert.equal(await settledWithinAsync(stopPromise, 250), true);
  assert.equal(tunnel.status, 'stopped');
  assert.equal(await settledWithinAsync(startPromise, 250), true);
  assert.equal(await settledWithinAsync(closePromise, 250), true);

  await new Promise((resolve) => server.close(resolve));
});
