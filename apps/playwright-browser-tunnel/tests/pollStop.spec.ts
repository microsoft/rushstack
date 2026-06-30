// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AddressInfo } from 'node:net';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import { WebSocketServer } from 'ws';

import type { ITerminal } from '@rushstack/terminal';

import { PlaywrightTunnel } from '../src';

function createNoopTerminal(): ITerminal {
  return {
    writeLine: () => {},
    writeWarningLine: () => {},
    writeErrorLine: () => {},
    writeDebugLine: () => {}
  } as ITerminal;
}

async function promiseSettledWithinAsync(promise: Promise<unknown>, milliseconds: number): Promise<boolean> {
  let settled: boolean = false;
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

async function createUnusedWsEndpointAsync(): Promise<string> {
  const server: WebSocketServer = new WebSocketServer({ port: 0 });
  await new Promise<void>((resolve) => {
    server.once('listening', () => resolve());
  });

  const address: AddressInfo = server.address() as AddressInfo;
  const port: number = address.port;
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });

  return `ws://127.0.0.1:${port}`;
}

test('stopAsync settles while waiting for a connection', async () => {
  const wsEndpoint: string = await createUnusedWsEndpointAsync();
  const installPath: string = mkdtempSync(join(tmpdir(), 'rushstack-playwright-browser-tunnel-'));
  const statuses: string[] = [];
  const tunnel: PlaywrightTunnel = new PlaywrightTunnel({
    mode: 'poll-connection',
    wsEndpoint,
    terminal: createNoopTerminal(),
    playwrightInstallPath: installPath,
    onStatusChange: (status) => {
      statuses.push(status);
    }
  });

  const startPromise: Promise<void> = tunnel.startAsync();
  await expect.poll(() => tunnel.status).toBe('waiting-for-connection');

  const stopPromise: Promise<void> = tunnel.stopAsync();
  await expect.poll(async () => await promiseSettledWithinAsync(stopPromise, 2000)).toBe(true);
  await expect.poll(() => tunnel.status).toBe('stopped');
  await expect.poll(async () => await promiseSettledWithinAsync(startPromise, 2000)).toBe(true);

  const restartPromise: Promise<void> = tunnel.startAsync();
  await expect.poll(() => tunnel.status).toBe('waiting-for-connection');

  const restartStopPromise: Promise<void> = tunnel.stopAsync();
  await expect.poll(async () => await promiseSettledWithinAsync(restartStopPromise, 2000)).toBe(true);
  await expect.poll(async () => await promiseSettledWithinAsync(restartPromise, 2000)).toBe(true);

  expect(statuses).toContain('waiting-for-connection');
  expect(statuses).toContain('stopped');
});

test('stopAsync closes an active websocket connection', async () => {
  const server: WebSocketServer = new WebSocketServer({ port: 0 });
  await new Promise<void>((resolve) => {
    server.once('listening', () => resolve());
  });

  const connectionPromise: Promise<void> = new Promise((resolve) => {
    server.once('connection', () => resolve());
  });

  const closePromise: Promise<void> = new Promise((resolve) => {
    server.once('connection', (ws) => {
      ws.once('close', () => resolve());
    });
  });

  const address: AddressInfo = server.address() as AddressInfo;
  const wsEndpoint: string = `ws://127.0.0.1:${address.port}`;
  const installPath: string = mkdtempSync(join(tmpdir(), 'rushstack-playwright-browser-tunnel-'));
  const tunnel: PlaywrightTunnel = new PlaywrightTunnel({
    mode: 'poll-connection',
    wsEndpoint,
    terminal: createNoopTerminal(),
    playwrightInstallPath: installPath,
    onStatusChange: () => {}
  });

  const startPromise: Promise<void> = tunnel.startAsync();
  await expect.poll(() => tunnel.status).toBe('waiting-for-connection');
  await connectionPromise;

  const stopPromise: Promise<void> = tunnel.stopAsync();
  await expect.poll(async () => await promiseSettledWithinAsync(stopPromise, 2000)).toBe(true);
  await expect.poll(() => tunnel.status).toBe('stopped');
  await expect.poll(async () => await promiseSettledWithinAsync(startPromise, 2000)).toBe(true);
  await expect.poll(async () => await promiseSettledWithinAsync(closePromise, 2000)).toBe(true);

  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});
