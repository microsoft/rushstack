// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import * as process from 'node:process';
import * as child_process from 'node:child_process';

import { RushdDaemon } from './RushdDaemon';
import { RushdClient } from './RushdClient';
import { readPidFile, isProcessRunning, getPipePath } from './RushdLifecycle';

function findWorkspaceRoot(): string {
  // Walk up from cwd looking for rush.json
  let dir: string = process.cwd();
  while (true) {
    try {
      const rushJsonPath: string = path.join(dir, 'rush.json');
      require('node:fs').accessSync(rushJsonPath);
      return dir;
    } catch {
      const parent: string = path.dirname(dir);
      if (parent === dir) {
        throw new Error('Could not find rush.json in any parent directory');
      }
      dir = parent;
    }
  }
}

function formatUptime(ms: number): string {
  const seconds: number = Math.floor(ms / 1000);
  const minutes: number = Math.floor(seconds / 60);
  const hours: number = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

async function handleStart(workspaceRoot: string): Promise<void> {
  // Check if already running
  const client: RushdClient = new RushdClient({ workspaceRoot });
  if (await client.isDaemonRunningAsync()) {
    console.log('rushd is already running for this workspace');
    return;
  }

  // Fork daemon as a detached background process
  const daemonScript: string = path.join(__dirname, 'startDaemon.js');
  const child: child_process.ChildProcess = child_process.fork(daemonScript, [workspaceRoot], {
    detached: true,
    stdio: 'ignore'
  });
  child.unref();

  // Wait briefly for daemon to start, then verify
  await new Promise<void>((resolve) => setTimeout(resolve, 1000));

  if (await client.isDaemonRunningAsync()) {
    const pid: number | undefined = readPidFile(workspaceRoot);
    console.log(`rushd started (PID ${pid}), listening on ${getPipePath(workspaceRoot)}`);
  } else {
    console.error('Failed to start rushd. Check logs for details.');
    process.exit(1);
  }
}

async function handleStop(workspaceRoot: string): Promise<void> {
  const client: RushdClient = new RushdClient({ workspaceRoot });

  if (!(await client.isDaemonRunningAsync())) {
    console.log('rushd is not running');
    return;
  }

  try {
    await client.connectAsync();
    await client.shutdownAsync();
    console.log('rushd stopped');
  } catch (err) {
    console.error(`Failed to stop rushd: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

async function handleStatus(workspaceRoot: string): Promise<void> {
  const pid: number | undefined = readPidFile(workspaceRoot);
  const client: RushdClient = new RushdClient({ workspaceRoot });

  if (!pid || !isProcessRunning(pid)) {
    console.log('rushd is not running');
    return;
  }

  if (!(await client.isDaemonRunningAsync())) {
    console.log(`rushd process exists (PID ${pid}) but is not responding`);
    return;
  }

  try {
    await client.connectAsync();
    const status = await client.getStatusAsync();
    client.disconnect();

    console.log(`rushd is running`);
    console.log(`  PID:              ${pid}`);
    console.log(`  State:            ${status.state}`);
    console.log(`  Uptime:           ${formatUptime(status.uptime)}`);
    console.log(`  Active clients:   ${status.activeClients}`);
    console.log(`  Protocol version: ${status.protocolVersion}`);
    console.log(`  Pipe:             ${getPipePath(workspaceRoot)}`);
  } catch (err) {
    console.error(`Failed to get status: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const command: string | undefined = process.argv[2];

  if (!command || command === '--help' || command === '-h') {
    console.log('Usage: rushd <command>');
    console.log('');
    console.log('Commands:');
    console.log('  start     Start the rushd daemon in the background');
    console.log('  stop      Stop the running rushd daemon');
    console.log('  status    Show daemon status');
    console.log('');
    return;
  }

  const workspaceRoot: string = findWorkspaceRoot();

  switch (command) {
    case 'start':
      await handleStart(workspaceRoot);
      break;
    case 'stop':
      await handleStop(workspaceRoot);
      break;
    case 'status':
      await handleStatus(workspaceRoot);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.error('Run "rushd --help" for usage');
      process.exit(1);
  }
}

main().catch((error) => {
  console.error(`Fatal error: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
