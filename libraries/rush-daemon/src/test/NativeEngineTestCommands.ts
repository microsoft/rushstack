// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as net from 'node:net';
import { spawn, type ChildProcess } from 'node:child_process';

import { createDeferred, type IDeferred } from './DaemonRequestWireTestUtilities';

export interface INativeCommandResult {
  readonly exitCode: number | undefined;
  readonly stdout: string;
  readonly stderr: string;
}

/** Runs an actual native Rush action in its own process, not as the daemon's execution engine. */
export function runNativeCommandAsync(
  repoRoot: string,
  argv: ReadonlyArray<string>
): Promise<INativeCommandResult> {
  const parserPath: string = require.resolve('@microsoft/rush-lib/lib/cli/RushCommandLineParser');
  const script: string = `
    const { RushCommandLineParser } = require(${JSON.stringify(parserPath)});
    new RushCommandLineParser({ cwd: ${JSON.stringify(repoRoot)} })
      .executeAsync(${JSON.stringify(argv)})
      .then((success) => { if (!success) process.exitCode = 1; })
      .catch((error) => { console.error(error); process.exitCode = 1; });
  `;
  const child: ChildProcess = spawn(process.execPath, ['-e', script], {
    cwd: repoRoot,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stdout: string = '';
  let stderr: string = '';
  child.stdout!.on('data', (data: Buffer) => {
    stdout += data.toString();
  });
  child.stderr!.on('data', (data: Buffer) => {
    stderr += data.toString();
  });
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (exitCode) => resolve({ exitCode: exitCode ?? undefined, stdout, stderr }));
  });
}

export interface INativeScriptGate extends AsyncDisposable {
  readonly entered: Promise<void>;
  releaseAsync(): Promise<void>;
}

/** A socket handshake makes active-script tests deterministic without sleeps or polling. */
export async function createNativeScriptGateAsync(
  repoRoot: string,
  projectName: string
): Promise<INativeScriptGate> {
  const entered: IDeferred<void> = createDeferred();
  const sockets: Set<net.Socket> = new Set();
  const server: net.Server = net.createServer((socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    entered.resolve();
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address: net.AddressInfo | string | null = server.address();
  if (!address || typeof address === 'string') throw new Error('The native script gate did not bind.');
  const gateFile: string = path.join(repoRoot, 'common', 'temp', `gate-${projectName}.json`);
  fs.writeFileSync(gateFile, JSON.stringify({ port: address.port }));
  let releasePromise: Promise<void> | undefined;
  const releaseAsync: () => Promise<void> = () => {
    releasePromise ??= new Promise<void>((resolve, reject) => {
      fs.rmSync(gateFile, { force: true });
      for (const socket of sockets) socket.end('continue');
      server.close((error) => (error ? reject(error) : resolve()));
    });
    return releasePromise;
  };
  return {
    entered: entered.promise,
    releaseAsync,
    [Symbol.asyncDispose]: releaseAsync
  };
}
