// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { Rush } from '@microsoft/rush-lib';
import {
  DaemonFrameType,
  decodeDaemonEventFrame,
  RUSHD_GRAPH_SNAPSHOT,
  type IDaemonFrame,
  type IDaemonGraphSnapshotPayload,
  type IDaemonRequestEnvelope
} from '@rushstack/rush-daemon-protocol';

import { ProductionDaemonRequestResolver } from '../ProductionDaemonRequestResolver';
import { RushDaemonHost } from '../RushDaemonHost';
import { WorkspaceSession } from '../WorkspaceSession';
import {
  createWireEnvelope,
  DaemonRequestWireClient,
  type ITerminalExchange
} from './DaemonRequestWireTestUtilities';

export class DaemonGraphTestFixture implements AsyncDisposable {
  public session!: WorkspaceSession;
  public host!: RushDaemonHost;
  public readonly folder: string = fs.mkdtempSync(path.join(os.tmpdir(), 'rushd-graph-'));
  public readonly environment: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter((pair): pair is [string, string] => pair[1] !== undefined)
    )
  };
  private _nextId: number = 0;

  public static async createAsync(
    configure?: (fixture: DaemonGraphTestFixture) => void
  ): Promise<DaemonGraphTestFixture> {
    const fixture: DaemonGraphTestFixture = new DaemonGraphTestFixture();
    try {
      fixture.write(
        'rush.json',
        JSON.stringify({
          rushVersion: Rush.version,
          npmVersion: '10.0.0',
          projectFolderMinDepth: 1,
          projects: ['a', 'b', 'c'].map((name) => ({ packageName: name, projectFolder: name }))
        })
      );
      fixture.write('.gitignore', 'common/temp/\n**/.rush/\n**/rush-logs/\nruns.txt\n');
      fixture.write('common/temp/last-link.flag', '{}');
      fixture.write('common/config/rush/npm-shrinkwrap.json', '{"lockfileVersion":3,"packages":{}}');
      fixture.write(
        'common/config/rush/command-line.json',
        JSON.stringify({
          phases: [{ name: '_phase:compile', dependencies: { upstream: ['_phase:compile'] } }],
          commands: [
            {
              commandKind: 'phased',
              name: 'build',
              phases: ['_phase:compile'],
              incremental: true,
              enableParallelism: true
            }
          ]
        })
      );
      for (const name of ['a', 'b', 'c']) {
        fixture.write(
          `${name}/package.json`,
          JSON.stringify({
            name,
            version: '1.0.0',
            dependencies: name === 'b' ? { a: '1.0.0' } : {},
            scripts: { '_phase:compile': 'node build.cjs' }
          })
        );
        fixture.write(`${name}/input.txt`, 'one');
        fixture.write(
          `${name}/build.cjs`,
          "const fs=require('node:fs');const name=require('./package.json').name;" +
            "fs.appendFileSync('../runs.txt',name+'\\n');console.log('building-'+name);" +
            "setTimeout(()=>console.log('finished-'+name),150);"
        );
      }
      configure?.(fixture);
      execFileSync('git', ['init', '--quiet'], { cwd: fixture.folder });
      execFileSync('git', ['add', '.'], { cwd: fixture.folder });
      execFileSync(
        'git',
        [
          '-c',
          'user.name=Graph Test',
          '-c',
          'user.email=graph@example.invalid',
          'commit',
          '--quiet',
          '-m',
          'fixture'
        ],
        { cwd: fixture.folder }
      );
      await fixture._startAsync();
      return fixture;
    } catch (error) {
      await fixture[Symbol.asyncDispose]();
      throw error;
    }
  }

  private async _startAsync(): Promise<void> {
    this.host = await RushDaemonHost.startAsync({
      repoRoot: this.folder,
      rushVersion: Rush.version,
      daemonVersion: 'graph-test',
      requestResolver: new ProductionDaemonRequestResolver(),
      createWorkspaceSessionAsync: async (options) => {
        this.session = await WorkspaceSession.createAsync(options);
        return this.session;
      }
    });
  }

  public async restartAsync(): Promise<void> {
    await this.host.closeAsync();
    await this._startAsync();
  }

  public write(name: string, text: string): void {
    const filename: string = path.join(this.folder, name);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, text);
  }

  public runs(): string[] {
    const filename: string = path.join(this.folder, 'runs.txt');
    return fs.existsSync(filename) ? fs.readFileSync(filename, 'utf8').trim().split('\n') : [];
  }

  public async connectAsync(): Promise<DaemonRequestWireClient> {
    const client: DaemonRequestWireClient = await DaemonRequestWireClient.connectAsync(
      this.host.paths.socketPath
    );
    await client.handshakeAsync();
    return client;
  }

  public envelope(argv: string[], overrides: Partial<IDaemonRequestEnvelope> = {}): IDaemonRequestEnvelope {
    return createWireEnvelope(`graph-${++this._nextId}`, argv[0], this.folder, {
      argv,
      commandOrigin: 'built-in',
      environment:
        argv[0] === 'daemon' ? { ...this.environment, RUSH_DAEMON_EXPERIMENTAL: '1' } : this.environment,
      terminal: { isTTY: false, supportsColor: false },
      ...overrides
    });
  }

  public async runAsync(
    argv: string[],
    overrides: Partial<IDaemonRequestEnvelope> = {}
  ): Promise<ITerminalExchange> {
    const client: DaemonRequestWireClient = await this.connectAsync();
    const payload: IDaemonRequestEnvelope = this.envelope(argv, overrides);
    try {
      await client.sendControlAsync({ kind: 'requestStart', payload });
      return await client.readTerminalAsync(payload.requestId);
    } finally {
      await client.closeAsync();
    }
  }

  public graphAsync(...argv: string[]): Promise<ITerminalExchange> {
    return this.runAsync(['daemon', 'graph', ...argv]);
  }

  public buildAsync(): Promise<ITerminalExchange> {
    return this.runAsync(['build', '--to', 'b', '--parallelism', '3']);
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    try {
      await this.host?.closeAsync();
    } finally {
      fs.rmSync(this.folder, { recursive: true, force: true });
    }
  }
}

export function graphSnapshot(frame: IDaemonFrame): IDaemonGraphSnapshotPayload['snapshot'] {
  expect(frame.kind).toBe(DaemonFrameType.event);
  const event = decodeDaemonEventFrame(frame.payload);
  expect(event).toMatchObject({ type: 'extension', payload: { name: RUSHD_GRAPH_SNAPSHOT } });
  const payload = event.payload as { data: IDaemonGraphSnapshotPayload };
  return payload.data.snapshot;
}

export function responseSnapshot(exchange: ITerminalExchange): IDaemonGraphSnapshotPayload['snapshot'] {
  expect(exchange.terminal).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
  const events: IDaemonFrame[] = exchange.frames.filter((frame) => frame.kind === DaemonFrameType.event);
  expect(events).toHaveLength(1);
  expect(
    exchange.frames.some(
      (frame) => frame.kind === DaemonFrameType.logStdout || frame.kind === DaemonFrameType.logStderr
    )
  ).toBe(false);
  return graphSnapshot(events[0]);
}
