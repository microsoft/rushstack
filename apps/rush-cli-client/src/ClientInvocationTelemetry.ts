// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { JsonFile } from '@rushstack/node-core-library';

const CONTEXT_PREFIX: string = 'rush-client-v1:';
const CLIENT_VERSION: string = (require('../package.json') as { version: string }).version;

interface IReporterConfiguration {
  readonly reporterPath: string;
  readonly logFolder: string;
  readonly disabledEnvironmentVariable?: string;
}

/** Request-local attribution, carried in the existing fingerprint-exempt telemetry tag. */
export interface IClientInvocationContext {
  readonly schemaVersion: 1;
  readonly invocationId: string;
  readonly attemptId: string;
  readonly clientVersion: string;
  readonly launcher: 'rush-client' | 'rushx-client';
  readonly route: 'daemon' | 'native' | 'fallback';
  readonly originalTag?: string;
  readonly fallbackReason?: string;
}

interface IAttempt {
  readonly attemptId: string;
  readonly backend: 'daemon' | 'native';
  readonly elapsedMs: number;
  readonly outcome: 'fallback' | 'returned';
}

interface IClientMachine {
  readonly os: string;
  readonly arch: string;
  readonly cores: number;
  readonly processor?: string;
  readonly totalMemoryBytes: number;
}

/** One completed client return, not the sum of parallel operations or a daemon's remaining work. */
export interface IClientInvocationEvent {
  readonly schemaVersion: 1;
  readonly eventId: string;
  readonly invocationId: string;
  readonly clientVersion: string;
  readonly launcher: 'rush-client' | 'rushx-client';
  readonly command: string;
  readonly scopeHash: string;
  readonly cwdHash?: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly route: 'daemon' | 'native' | 'fallback';
  readonly routeReason: string;
  readonly exitCode: number;
  readonly elapsedMs: number;
  readonly durationBasis: 'node-process-to-client-return';
  readonly attempts: readonly IAttempt[];
  readonly operationsReexecuted?: number;
  readonly agentSessionId?: string;
  readonly machine: IClientMachine;
}

/** Repository-configured, best-effort reporting without a tenant-specific dependency in the client. */
export class ClientInvocationTelemetry {
  readonly #startedAt: string = new Date(performance.timeOrigin).toISOString();
  readonly #invocationId: string = randomUUID();
  #scopeHash: string;
  readonly #cwdHash: string;
  readonly #attempts: IAttempt[] = [];
  readonly #root: string;
  readonly #configuration: IReporterConfiguration;
  readonly #agentSessionId: string | undefined = process.env.COPILOT_AGENT_SESSION_ID;
  readonly #machine: IClientMachine;
  #context: IClientInvocationContext;
  #attemptStartedAtMs: number = 0;
  #command: string = 'unknown';
  #routeReason: string = 'routing-not-completed';
  #reported: boolean = false;
  #safePreExecutionFallback: boolean = false;

  private constructor(root: string, configuration: IReporterConfiguration, rushx: boolean) {
    this.#root = root;
    this.#cwdHash = createHash('sha256')
      .update(path.relative(root, process.cwd()).split(path.sep).join('/'))
      .digest('hex');
    this.#configuration = configuration;
    const cpus: os.CpuInfo[] = os.cpus();
    this.#machine = {
      os: process.platform,
      arch: process.arch,
      cores: cpus.length,
      processor: cpus[0]?.model,
      totalMemoryBytes: os.totalmem()
    };
    this.#scopeHash = createHash('sha256')
      .update(JSON.stringify(process.argv.slice(2)))
      .digest('hex');
    this.#context = {
      schemaVersion: 1,
      invocationId: this.#invocationId,
      attemptId: randomUUID(),
      clientVersion: CLIENT_VERSION,
      launcher: rushx ? 'rushx-client' : 'rush-client',
      route: 'native',
      ...(process.env.RUSHD_TELEMETRY_TAG === undefined
        ? {}
        : { originalTag: process.env.RUSHD_TELEMETRY_TAG })
    };
    // Native Rush starts asynchronous work and does not return its completion promise to the launcher.
    process.once('beforeExit', (code: number) => this.#report(code));
    // An explicit exit can start the bounded, detached reporter, but cannot wait for its delivery.
    process.once('exit', (code: number) => this.#report(code));
  }

  public static initialize(
    rushJsonPath: string | undefined,
    rushx: boolean
  ): ClientInvocationTelemetry | undefined {
    if (process.env.RUSHD_CLIENT_TELEMETRY_PARENT === '1') return undefined;
    if (!rushJsonPath) return undefined;
    const root: string = path.dirname(rushJsonPath);
    const configurationPath: string = `${root}/common/config/rush-client/telemetry.json`;
    if (!fs.existsSync(configurationPath)) return undefined;
    try {
      const configuration: IReporterConfiguration = JsonFile.load(configurationPath);
      if (
        typeof configuration.reporterPath !== 'string' ||
        typeof configuration.logFolder !== 'string' ||
        (configuration.disabledEnvironmentVariable !== undefined &&
          typeof configuration.disabledEnvironmentVariable !== 'string')
      ) {
        throw new Error('Expected reporterPath, logFolder and an optional disabledEnvironmentVariable');
      }
      if (
        configuration.disabledEnvironmentVariable &&
        process.env[configuration.disabledEnvironmentVariable] === '1'
      ) {
        return undefined;
      }
      resolveRepositoryPath(root, configuration.reporterPath);
      const logFolder: string = resolveRepositoryPath(root, configuration.logFolder);
      const statusPath: string = `${logFolder}/.reporter-status`;
      try {
        if (fs.existsSync(statusPath)) {
          const status: { success?: boolean } = JsonFile.load(statusPath);
          if (status.success === false) {
            process.stderr.write(
              'rush-client: previous telemetry reporter failed; receipts and reporter-errors.log are retained.\n'
            );
          }
        }
      } catch (error) {
        process.stderr.write(
          `rush-client: telemetry reporter status is unavailable: ${(error as Error).message}\n`
        );
      }
      return new ClientInvocationTelemetry(root, configuration, rushx);
    } catch (error) {
      process.stderr.write(`rush-client: invocation telemetry is unavailable: ${(error as Error).message}\n`);
      return undefined;
    }
  }

  public selectRoute(
    command: string | undefined,
    daemon: boolean,
    reason?: string,
    argv?: ReadonlyArray<string>
  ): void {
    this.#command = command ?? 'unknown';
    this.#routeReason = daemon ? 'daemon-selected' : (reason ?? 'explicit-native-or-help');
    this.#context = { ...this.#context, route: daemon ? 'daemon' : 'native' };
    if (argv) {
      this.#scopeHash = createHash('sha256').update(JSON.stringify(argv)).digest('hex');
    }
  }

  public get attemptId(): string {
    return this.#context.attemptId;
  }

  public getEnvironment(
    environment: Readonly<Record<string, string | undefined>>
  ): Readonly<Record<string, string | undefined>> {
    return { ...environment, RUSHD_TELEMETRY_TAG: `${CONTEXT_PREFIX}${JSON.stringify(this.#context)}` };
  }

  public beginFallback(reason: string): void {
    const now: number = Math.round(performance.now());
    this.#attempts.push({
      attemptId: this.#context.attemptId,
      backend: 'daemon',
      elapsedMs: now - this.#attemptStartedAtMs,
      outcome: 'fallback'
    });
    this.#attemptStartedAtMs = now;
    this.#routeReason = reason;
    this.#safePreExecutionFallback = true;
    this.#context = {
      ...this.#context,
      attemptId: randomUUID(),
      route: 'fallback',
      fallbackReason: reason
    };
  }

  public prepareNativeEnvironment(): void {
    process.env.RUSHD_TELEMETRY_TAG = this.getEnvironment(process.env).RUSHD_TELEMETRY_TAG;
  }

  #createEvent(exitCode: number): IClientInvocationEvent {
    const elapsedMs: number = Math.round(performance.now());
    return {
      schemaVersion: 1,
      eventId: randomUUID(),
      invocationId: this.#invocationId,
      clientVersion: CLIENT_VERSION,
      launcher: this.#context.launcher,
      command: this.#command,
      scopeHash: this.#scopeHash,
      cwdHash: this.#cwdHash,
      startedAt: this.#startedAt,
      completedAt: new Date().toISOString(),
      route: this.#context.route,
      routeReason: this.#routeReason,
      exitCode,
      elapsedMs,
      durationBasis: 'node-process-to-client-return',
      attempts: [
        ...this.#attempts,
        {
          attemptId: this.#context.attemptId,
          backend: this.#context.route === 'daemon' ? 'daemon' : 'native',
          elapsedMs: elapsedMs - this.#attemptStartedAtMs,
          outcome: 'returned'
        }
      ],
      agentSessionId: this.#agentSessionId,
      machine: this.#machine,
      ...(this.#safePreExecutionFallback ? { operationsReexecuted: 0 } : {})
    };
  }

  #persist(exitCode: number): string | undefined {
    if (this.#reported) return undefined;
    this.#reported = true;
    try {
      const folder: string = resolveRepositoryPath(this.#root, this.#configuration.logFolder);
      fs.mkdirSync(folder, { recursive: true });
      const file: string = `${folder}/${this.#invocationId}.json`;
      fs.writeFileSync(file, JSON.stringify(this.#createEvent(exitCode)), { mode: 0o600, flag: 'wx' });
      if (exitCode !== 0 || this.#context.route === 'fallback') {
        process.stderr.write(
          `rush-client: invocation receipt: ${this.#configuration.logFolder}/${this.#invocationId}.json\n`
        );
      }
      return file;
    } catch (error) {
      this.#warn(error as Error);
      return undefined;
    }
  }

  #report(exitCode: number): void {
    const file: string | undefined = this.#persist(exitCode);
    if (!file) return;
    let errorLog: number | undefined;
    try {
      const reporter: string = resolveRepositoryPath(this.#root, this.#configuration.reporterPath);
      if (!fs.statSync(reporter).isFile()) throw new Error('Reporter is not a regular file');
      const folder: string = resolveRepositoryPath(this.#root, this.#configuration.logFolder);
      errorLog = fs.openSync(`${folder}/reporter-errors.log`, 'a', 0o600);
      const child: ChildProcess = spawn(process.execPath, [reporter, '--invocation', file], {
        cwd: this.#root,
        detached: true,
        windowsHide: true,
        stdio: ['ignore', 'ignore', errorLog]
      });
      child.once('error', (error: Error) => this.#warn(error));
      child.unref();
    } catch (error) {
      this.#warn(error as Error);
    } finally {
      if (errorLog !== undefined) fs.closeSync(errorLog);
    }
  }

  #warn(error: Error): void {
    process.stderr.write(`rush-client: invocation telemetry failed: ${error.message}\n`);
  }
}

function resolveRepositoryPath(root: string, value: string): string {
  const resolved: string = path.resolve(root, value);
  const relative: string = path.relative(root, resolved);
  if (!value || path.isAbsolute(value) || relative.startsWith('..') || !relative) {
    throw new Error('Client telemetry paths must be relative paths inside the repository');
  }
  return resolved;
}
