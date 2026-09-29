// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  DAEMON_PROTOCOL_VERSION,
  DaemonFrameType,
  decodeDaemonControlMessage,
  encodeDaemonControlMessage
} from '@rushstack/rush-daemon-protocol';
import {
  DaemonFrameListener,
  type DaemonFrameConnection,
  type IDaemonPaths
} from '@rushstack/rush-daemon-transport';

import { connectOrStartDaemonAsync } from '../../connectOrStartDaemon';

async function mainAsync(): Promise<void> {
  const paths: IDaemonPaths = JSON.parse(process.argv[2]);
  const folder: string = path.dirname(paths.lockfilePath);
  const daemonVersion: string = process.argv[3] ?? 'fixture';
  const mode: string | undefined = process.argv[4];
  const restartMode: string | undefined = mode?.startsWith('restart-') ? mode : undefined;
  // While this file exists, the daemon waits before it listens. It writes its PID to the file named without "hold-".
  const holdPrebindName: string = process.env.FIXTURE_HOLD_PREBIND ?? 'hold-prebind';
  const connections: Set<DaemonFrameConnection> = new Set();
  let closing: Promise<void> | undefined;
  let heldRequest: { connection: DaemonFrameConnection; requestId: string } | undefined;
  let plannedRestartAnswers: number = 0;
  fs.appendFileSync(path.join(folder, 'starts'), `${process.pid}\n`);
  fs.appendFileSync(
    path.join(folder, 'identities'),
    `${process.pid} ${process.env.FIXTURE_IDENTITY ?? 'client'}\n`
  );
  fs.appendFileSync(path.join(folder, 'parents'), `${process.ppid}\n`);
  fs.writeFileSync(path.join(folder, 'runtime-base'), process.env.RUSHD_RUNTIME_DIR ?? '(unset)');
  process.stdout.write('launcher stdout\n');
  process.stderr.write('launcher stderr\n');
  if (fs.existsSync(path.join(folder, holdPrebindName))) {
    const marker: string = path.join(folder, `prebind-${process.pid}.tmp`);
    fs.writeFileSync(marker, String(process.pid));
    fs.renameSync(marker, path.join(folder, holdPrebindName.replace(/^hold-/, '')));
    while (fs.existsSync(path.join(folder, holdPrebindName))) {
      if (fs.existsSync(path.join(folder, 'stop'))) {
        fs.writeFileSync(path.join(folder, `stopped-${process.pid}`), '');
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  await new Promise((resolve) => setTimeout(resolve, readStartupDelayMs(folder)));
  const listener = await DaemonFrameListener.listenAsync(paths, {
    protocolVersion: DAEMON_PROTOCOL_VERSION,
    onConnection: (connection) => {
      connections.add(connection);
      connection.onClosed(() => connections.delete(connection));
      connection.onFrame(async (frame) => {
        const message = decodeDaemonControlMessage(frame.payload);
        if (message.kind === 'hello') {
          await connection.sendFrameAsync({
            kind: DaemonFrameType.controlJson,
            payload: encodeDaemonControlMessage({
              kind: 'helloAck',
              payload: { protocolVersion: DAEMON_PROTOCOL_VERSION, sessionId: 'fixture' }
            })
          });
        } else if (message.kind === 'ping') {
          await connection.sendFrameAsync({
            kind: DaemonFrameType.controlJson,
            payload: encodeDaemonControlMessage({
              kind: 'pong',
              payload: { daemonVersion, uptimeMs: 1, pid: process.pid }
            })
          });
        } else if (message.kind === 'requestStart') {
          fs.appendFileSync(path.join(folder, 'requests'), `${daemonVersion}\n`);
          if (mode === 'crash-on-request' || mode === 'kill-on-request') {
            exitAbruptly();
            return;
          }
          if (mode === 'close-on-request') {
            await connection.closeAsync();
            return;
          }
          if (mode === 'hold-until-shutdown' || mode === 'crash-on-cancel') {
            heldRequest = { connection, requestId: message.payload.requestId };
            return;
          }
          if (message.payload.admission?.waitTimeoutMs !== undefined) {
            fs.appendFileSync(path.join(folder, 'waits'), `${message.payload.admission.waitTimeoutMs}\n`);
          }
          if (message.payload.admission?.waitTimeoutIsDefault) {
            fs.appendFileSync(
              path.join(folder, 'default-waits'),
              `${message.payload.admission.waitTimeoutMs}\n`
            );
          }
          const restartCount: number = fs.existsSync(path.join(folder, 'restarted'))
            ? fs.readFileSync(path.join(folder, 'restarted'), 'utf8').length
            : 0;
          const restart: boolean =
            restartMode !== undefined &&
            ((restartMode !== 'restart-once' && restartMode !== 'restart-installation') ||
              restartCount < 1) &&
            (restartMode !== 'restart-twice' || restartCount < 2);
          const drainMsPath: string = path.join(folder, 'drain-ms');
          if (restart && fs.existsSync(drainMsPath)) {
            // Like a daemon that restarts only after the requests it serves finish.
            await new Promise((resolve) => setTimeout(resolve, Number(fs.readFileSync(drainMsPath, 'utf8'))));
          }
          await connection.sendFrameAsync({
            kind: DaemonFrameType.controlJson,
            payload: encodeDaemonControlMessage({
              kind: 'requestResult',
              payload: {
                requestId: message.payload.requestId,
                exitCode: restart ? 1 : 0,
                outcome: restart ? 'failure' : 'success',
                aborted: false,
                ...(restart ? { retryAfterRestart: true as const } : {}),
                ...(restart && restartMode === 'restart-installation'
                  ? {
                      restartReason: {
                        kind: 'installationChanged' as const,
                        change: 'removed' as const,
                        folder: path.join(folder, 'gone')
                      }
                    }
                  : {})
              }
            })
          });
          if (restart && restartMode === 'restart-planned') {
            // Like RushDaemonHost: answer every request, then release ownership and launch the successor itself.
            if (++plannedRestartAnswers === readNumber(folder, 'planned-requests', 1)) {
              void launchPlannedSuccessorAsync().catch((error: Error) => {
                process.stderr.write(`${error.stack}\n`);
                process.exitCode = 1;
              });
            }
          } else if (restart && restartMode !== 'restart-held') {
            fs.appendFileSync(path.join(folder, 'restarted'), 'r');
            await stopAsync();
          }
        } else if (message.kind === 'requestCancel' && mode === 'crash-on-cancel') {
          exitAbruptly();
        } else if (message.kind === 'shutdown') {
          if (heldRequest) {
            // Like rushd, an orderly shutdown ends a running request with an aborted result first.
            await heldRequest.connection.sendFrameAsync({
              kind: DaemonFrameType.controlJson,
              payload: encodeDaemonControlMessage({
                kind: 'requestResult',
                payload: {
                  requestId: heldRequest.requestId,
                  exitCode: 130,
                  outcome: 'aborted',
                  aborted: true
                }
              })
            });
          }
          await connection.sendFrameAsync({
            kind: DaemonFrameType.controlJson,
            payload: encodeDaemonControlMessage({ kind: 'shutdownAck', payload: {} })
          });
          await stopAsync();
        }
      });
    }
  });
  const expiry: number = Date.now() + 10000;
  const timer = setInterval(() => {
    if (!fs.existsSync(path.join(folder, 'stop')) && Date.now() < expiry) return;
    void stopAsync().catch((error: Error) => {
      process.stderr.write(`${error.stack}\n`);
      process.exitCode = 1;
    });
  }, 50);

  function stopAsync(): Promise<void> {
    closing ??= closeOnceAsync();
    return closing;
  }

  /** Exits like a crashed daemon, without cleanup. The test expects this exit, so it also counts as stopped. */
  function exitAbruptly(): void {
    fs.writeFileSync(path.join(folder, `stopped-${process.pid}`), '');
    if (mode === 'kill-on-request') process.kill(process.pid, 'SIGKILL');
    setImmediate(() => {
      throw new Error('fixture daemon crash\nwhile running the request');
    });
  }

  async function launchPlannedSuccessorAsync(): Promise<void> {
    await stopAsync();
    // The "planned-launch-delay-ms" file models a launch that begins well after ownership is released.
    await new Promise((resolve) => setTimeout(resolve, readNumber(folder, 'planned-launch-delay-ms', 0)));
    const environment: Record<string, string> = {};
    for (const [name, value] of Object.entries(process.env)) {
      if (value !== undefined) environment[name] = value;
    }
    const successor = await connectOrStartDaemonAsync({
      paths,
      expectedDaemonVersion: daemonVersion,
      startCommand: {
        command: process.execPath,
        args: [__filename, JSON.stringify(paths), daemonVersion],
        cwd: folder,
        environment: { ...environment, FIXTURE_IDENTITY: 'planned' }
      }
    });
    try {
      const { pid } = await successor.status;
      fs.writeFileSync(path.join(folder, 'planned-successor'), String(pid));
    } finally {
      await successor.closeAsync();
    }
  }

  async function closeOnceAsync(): Promise<void> {
    clearInterval(timer);
    const stopped: Promise<void> = listener.stopAcceptingAsync();
    await Promise.all([...connections].map((connection) => connection.closeAsync()));
    await stopped;
    if (restartMode) await new Promise((resolve) => setTimeout(resolve, 150));
    await listener.closeAsync();
    fs.writeFileSync(path.join(folder, `stopped-${process.pid}`), '');
  }
}

/** How long the daemon waits before it listens: 250 milliseconds, or the number in the "startup-delay-ms" file. */
function readStartupDelayMs(folder: string): number {
  return readNumber(folder, 'startup-delay-ms', 250);
}

function readNumber(folder: string, name: string, defaultValue: number): number {
  const filePath: string = path.join(folder, name);
  return fs.existsSync(filePath) ? Number(fs.readFileSync(filePath, 'utf8')) : defaultValue;
}

mainAsync().catch((error: Error) => {
  // For example, the daemon found another one at the endpoint. The test expects this exit, so it counts as stopped.
  const folder: string = path.dirname((JSON.parse(process.argv[2]) as IDaemonPaths).lockfilePath);
  fs.appendFileSync(path.join(folder, 'failures'), `${process.pid} ${error.message}\n`);
  fs.writeFileSync(path.join(folder, `stopped-${process.pid}`), '');
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
