// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

import type { IDaemonPongMessage } from '@rushstack/rush-daemon-protocol';

import { createNativeBuildTestFixture, type INativeBuildTestFixture, type INativeBuildResult } from './NativeBuildTestFixture';

export interface IIpcEvent {
  readonly kind: 'ready' | 'started' | 'pressure-ready' | 'complete' | 'closed';
  readonly project: string;
  readonly pid: number;
  readonly iteration?: number;
  readonly residentMemoryBytes?: number;
  readonly durationMs?: number;
  readonly implementation?: string;
  readonly args?: string[];
}

export interface IPersistentIpcTestFixture extends INativeBuildTestFixture {
  write(relative: string, text: string): void;
  input(project: string, values: Record<string, unknown>): void;
  events(): IIpcEvent[];
  statusAsync(): Promise<IDaemonPongMessage['payload']>;
  buildAsync(...selection: string[]): Promise<INativeBuildResult>;
}

export function createPersistentIpcTestFixture(options: {
  telemetry?: boolean;
  enabled?: boolean;
  budgetMB?: number;
  configurationKind?: 'direct' | 'inherited' | 'rig';
} = {}): IPersistentIpcTestFixture {
  const base: INativeBuildTestFixture = createNativeBuildTestFixture();
  const write = (relative: string, text: string): void => {
    const filename = path.join(base.folder, relative);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, text);
  };
  for (const name of ['RUSH_DAEMON_USE_PERSISTENT_IPC_RUNNERS', 'RUSH_DAEMON_AUTO_WARM_BY_TELEMETRY',
    'RUSH_DAEMON_WARM_MEMORY_BUDGET_MB', 'RUSH_DAEMON_WARM_SET_MAX_PROJECTS']) delete base.environment[name];
  const config = JSON.parse(fs.readFileSync(path.join(base.folder, 'rush.json'), 'utf8'));
  config.telemetryEnabled = true;
  config.daemon = {
    ...config.daemon,
    usePersistentIpcRunners: options.enabled ?? true,
    watch: true,
    autoWarmByTelemetry: options.telemetry ?? true,
    warmMemoryBudgetMB: options.budgetMB ?? 100_000,
    warmSetMaxProjects: 20,
    warmIdleTimeoutSeconds: 300
  };
  write('rush.json', JSON.stringify(config));
  write('.gitignore', 'common/temp/\n**/.rush/\n**/rush-logs/\n**/lib/\n**/node_modules/\nruns.txt\nrushd*/\n');
  write('common/config/rush/command-line.json', JSON.stringify({
    phases: [{ name: '_phase:compile' }, { name: '_phase:empty', missingScriptBehavior: 'silent' }],
    commands: [
      { commandKind: 'phased', name: 'build', phases: ['_phase:compile', '_phase:empty'],
        incremental: true, enableParallelism: true },
      { commandKind: 'phased', name: 'rebuild', phases: ['_phase:compile', '_phase:empty'],
        incremental: false, enableParallelism: true }
    ],
    parameters: [
      { parameterKind: 'string', longName: '--label', argumentName: 'LABEL', description: 'Raw label',
        associatedCommands: ['build', 'rebuild'], associatedPhases: ['_phase:compile'] },
      { parameterKind: 'string', longName: '--ignored', argumentName: 'VALUE', description: 'Excluded value',
        associatedCommands: ['build', 'rebuild'], associatedPhases: ['_phase:compile'] }
    ]
  }));
  for (const name of ['a', 'b']) {
    const settings = {
      operationSettings: [{
        operationName: '_phase:compile',
        outputFolderNames: ['lib'],
        parameterNamesToIgnore: ['--ignored'],
        daemonIpc: { entryPoint: 'tools/ipc/entry.cjs', args: ['literal space', '"quoted"', '%NOT_EXPANDED%'] }
      }]
    };
    if (options.configurationKind === 'inherited') {
      write(`${name}/config/rush-project.json`, '{"extends":"../../common/temp/shared-ipc.json"}');
      write('common/temp/shared-ipc.json', JSON.stringify(settings));
    } else if (options.configurationKind === 'rig') {
      write(`${name}/config/rig.json`, '{"rigPackageName":"ipc-fixture-rig"}');
      write(`${name}/node_modules/ipc-fixture-rig/package.json`, '{"name":"ipc-fixture-rig","version":"1.0.0"}');
      write(`${name}/node_modules/ipc-fixture-rig/profiles/default/config/rush-project.json`, JSON.stringify(settings));
    } else {
      write(`${name}/config/rush-project.json`, JSON.stringify(settings));
    }
    write(`${name}/tools/ipc/implementation.cjs`, "exports.version = 'original';\n");
    write(`${name}/tools/ipc/entry.cjs`, createIpcToolSource());
    write(`${name}/run-input.json`, JSON.stringify({ value: 'one', memoryBytes: 16 * 1024 * 1024 }));
  }
  execFileSync('git', ['add', '.'], { cwd: base.folder });
  execFileSync('git', ['-c', 'user.name=IPC Test', '-c', 'user.email=ipc@example.invalid', 'commit', '--quiet', '-m', 'explicit IPC fixture'],
    { cwd: base.folder });
  return {
    ...base,
    write,
    input: (project, values) => write(`${project}/run-input.json`, JSON.stringify(values)),
    events: () => {
      const filename = path.join(base.folder, 'common/temp/ipc-events.jsonl');
      return fs.existsSync(filename)
        ? fs.readFileSync(filename, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line))
        : [];
    },
    statusAsync: async () => {
      const result = await base.invokeAsync(['daemon', 'status']);
      if (result.code !== 0) throw new Error(`IPC daemon status failed: ${result.stderr}\n${result.stdout}`);
      return JSON.parse(result.stdout);
    },
    buildAsync: async (...selection) => {
      const result = await base.invokeAsync(['build', ...selection, '--parallelism', '2', '--verbose']);
      if (result.code !== 0 || /using in-process/i.test(result.stderr)) {
        throw new Error(`Native IPC build failed (${result.code}): ${result.stderr}\n${result.stdout}`);
      }
      return result;
    }
  };
}

function createIpcToolSource(): string {
  return `
const fs = require('node:fs');
const path = require('node:path');
const implementation = require('./implementation.cjs');
const project = require(path.join(process.cwd(), 'package.json')).name;
const events = path.resolve('../common/temp/ipc-events.jsonl');
const record = (value) => fs.appendFileSync(events, JSON.stringify({ project, pid: process.pid, ...value }) + '\\n');
let iteration = 0;
let memory;
let additionalMemory;
let pending = Promise.resolve();
let closing = false;
record({ kind: 'ready', args: process.argv.slice(2), implementation: implementation.version });
process.on('message', (message) => {
  if (message.command === 'run' && !closing) {
    pending = pending.then(async () => {
      const startedAt = performance.now();
      const input = JSON.parse(fs.readFileSync('run-input.json', 'utf8'));
      record({ kind: 'started', iteration: iteration + 1 });
      const memoryBytes = input.memoryBytes || 16 * 1024 * 1024;
      if (!input.retainMemory || !memory || memory.length !== memoryBytes) memory = Buffer.alloc(memoryBytes, 1);
      if (iteration === 0) await new Promise(resolve => setTimeout(resolve, input.coldDelayMs ?? (project === 'a' ? 800 : 50)));
      if (input.delayMs) await new Promise(resolve => setTimeout(resolve, input.delayMs));
      iteration++;
      fs.mkdirSync('lib', { recursive: true });
      fs.writeFileSync('lib/result.txt', input.value + ':' + implementation.version);
      const output = 'ipc-' + project + '-' + input.value + '-' + implementation.version + '\\n';
      await new Promise(resolve => process.stdout.write(output, resolve));
      if (input.outputBytes) await new Promise(resolve => process.stdout.write(
        'PAYLOAD_BEGIN:' + String.fromCodePoint(0x1f642).repeat(input.outputBytes) + ':PAYLOAD_END\\n', resolve));
      if (input.warning) await new Promise(resolve => process.stderr.write('ipc-warning\\n', resolve));
      if (input.pressureGate) {
        memory.fill(1);
        record({ kind: 'pressure-ready', iteration, residentMemoryBytes: process.memoryUsage().rss });
        const deadline = performance.now() + 10000;
        while (!fs.existsSync(input.pressureGate)) {
          if (performance.now() >= deadline) throw new Error('Pressure fixture gate was not released.');
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        const gate = JSON.parse(fs.readFileSync(input.pressureGate, 'utf8'));
        if (gate.cancelled) throw new Error('Pressure fixture setup was cancelled.');
        additionalMemory = Buffer.alloc(gate.additionalMemoryBytes, 1);
        memory.fill(1);
        additionalMemory.fill(1);
      }
      const residentMemoryBytes = process.memoryUsage().rss;
      record({ kind: 'complete', iteration, residentMemoryBytes, durationMs: performance.now() - startedAt, implementation: implementation.version });
      process.send({ event: 'after-execute', status: input.failure ? 'FAILURE' : 'SUCCESS', residentMemoryBytes });
    }).catch(error => { console.error(error); process.exitCode = 1; process.disconnect(); });
  } else if (message.command === 'exit') {
    closing = true;
    pending.then(() => { record({ kind: 'closed' }); process.disconnect(); });
  }
});
process.send({ event: 'sync', status: 'READY' });
`;
}
