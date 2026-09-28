// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock('../OperationStateFile');
// Mock project log file creation to avoid filesystem writes.
jest.mock('../ProjectLogWritable', () => {
  const actual = jest.requireActual('../ProjectLogWritable');
  const { TerminalWritable } = jest.requireActual('@rushstack/terminal');
  class MockTerminalWritable extends TerminalWritable {
    protected onWriteChunk(): void {
      /* noop */
    }
    protected onClose(): void {
      /* noop */
    }
  }
  return {
    ...actual,
    initializeProjectLogFilesAsync: jest.fn(async () => new MockTerminalWritable())
  };
});

import { MockWritable } from '@rushstack/terminal';

import type { IPhase } from '../../../api/CommandLineConfiguration';
import type { RushConfigurationProject } from '../../../api/RushConfigurationProject';
import type { IEnvironment } from '../../../utilities/Utilities';
import type { IInputsSnapshot, IRushConfigurationProjectForSnapshot } from '../../incremental/InputsSnapshot';
import type { IOperationGraphIterationOptions } from '../IOperationGraph';
import type { IOperationRunnerContext } from '../IOperationRunner';
import { Operation } from '../Operation';
import { OperationGraph } from '../OperationGraph';
import { OperationStatus } from '../OperationStatus';
import { MockOperationRunner } from './MockOperationRunner';

const SESSION_VARIABLE: string = 'RUSH_TEST_OPERATION_ENVIRONMENT_SESSION';

const mockPhase: IPhase = {
  name: 'phase',
  allowWarningsOnSuccess: false,
  associatedParameters: new Set(),
  dependencies: {
    self: new Set(),
    upstream: new Set()
  },
  isSynthetic: false,
  logFilenameIdentifier: 'phase',
  missingScriptBehavior: 'silent'
};

class EnvironmentRecordingRunner extends MockOperationRunner {
  public readonly sessions: (string | undefined)[] = [];

  public override async executeAsync(context: IOperationRunnerContext): Promise<OperationStatus> {
    this.sessions.push(context.environment?.[SESSION_VARIABLE]);
    return await super.executeAsync(context);
  }
}

function createGraph(runners: ReadonlyArray<EnvironmentRecordingRunner>): OperationGraph {
  const operations: Operation[] = runners.map(
    (runner: EnvironmentRecordingRunner) =>
      new Operation({
        runner,
        logFilenameIdentifier: runner.name,
        phase: mockPhase,
        project: { packageName: runner.name } as unknown as RushConfigurationProject
      })
  );
  return new OperationGraph(new Set(operations), {
    quietMode: false,
    debugMode: false,
    parallelism: 1,
    allowOversubscription: true,
    destinations: [new MockWritable()],
    abortController: new AbortController()
  });
}

describe('OperationGraph operation environment', () => {
  afterEach(() => {
    delete process.env[SESSION_VARIABLE];
  });

  it('starts operations from process.env by default', async () => {
    process.env[SESSION_VARIABLE] = 'host';
    const runner: EnvironmentRecordingRunner = new EnvironmentRecordingRunner('operation');
    const graph: OperationGraph = createGraph([runner]);

    expect((await graph.executeAsync({})).status).toBe(OperationStatus.Success);
    expect(runner.sessions).toEqual(['host']);
  });

  it('starts each operation from the environment that the iteration chooses for it, before plugin taps', async () => {
    process.env[SESSION_VARIABLE] = 'host';
    const first: EnvironmentRecordingRunner = new EnvironmentRecordingRunner('first');
    const second: EnvironmentRecordingRunner = new EnvironmentRecordingRunner('second');
    const graph: OperationGraph = createGraph([first, second]);
    const tapSessions: (string | undefined)[] = [];
    graph.hooks.createEnvironmentForOperation.tap('test', (environment: IEnvironment) => {
      tapSessions.push(environment[SESSION_VARIABLE]);
      // A tap edits its own copy, never the environment that the iteration supplied.
      environment[SESSION_VARIABLE] = `${environment[SESSION_VARIABLE]}+tap`;
      return environment;
    });
    const sessionA: Readonly<Record<string, string>> = { [SESSION_VARIABLE]: 'A' };
    const sessionB: Readonly<Record<string, string>> = { [SESSION_VARIABLE]: 'B' };

    const iterations: (IOperationGraphIterationOptions['getOperationEnvironment'] | undefined)[] = [
      (operation: Operation) => (operation.runner === first ? sessionA : sessionB),
      () => sessionB,
      undefined
    ];
    for (const getOperationEnvironment of iterations) {
      expect((await graph.executeAsync({ getOperationEnvironment })).status).toBe(OperationStatus.Success);
    }

    expect(first.sessions).toEqual(['A+tap', 'B+tap', 'host+tap']);
    expect(second.sessions).toEqual(['B+tap', 'B+tap', 'host+tap']);
    expect(tapSessions.sort()).toEqual(['A', 'B', 'B', 'B', 'host', 'host']);
    expect([sessionA, sessionB, process.env[SESSION_VARIABLE]]).toEqual([
      { [SESSION_VARIABLE]: 'A' },
      { [SESSION_VARIABLE]: 'B' },
      'host'
    ]);
  });

  it("hashes each operation's inputs with the environment that it starts from", async () => {
    const first: EnvironmentRecordingRunner = new EnvironmentRecordingRunner('first');
    const second: EnvironmentRecordingRunner = new EnvironmentRecordingRunner('second');
    const graph: OperationGraph = createGraph([first, second]);
    const hashedEnvironments: Map<string, Readonly<Record<string, string | undefined>> | undefined> =
      new Map();
    const inputsSnapshot: IInputsSnapshot = {
      hashes: new Map(),
      rootDirectory: '/repo',
      hasUncommittedChanges: false,
      getTrackedFileHashesForOperation: () => new Map(),
      getOperationOwnStateHash: (
        project: IRushConfigurationProjectForSnapshot,
        operationName?: string,
        environment?: Readonly<Record<string, string | undefined>>
      ) => {
        hashedEnvironments.set((project as RushConfigurationProject).packageName, environment);
        return 'local';
      }
    };
    const sessionA: Readonly<Record<string, string>> = { [SESSION_VARIABLE]: 'A' };

    await graph.executeAsync({
      inputsSnapshot,
      getOperationEnvironment: (operation: Operation) => (operation.runner === first ? sessionA : {})
    });
    expect(hashedEnvironments).toEqual(
      new Map([
        ['first', sessionA],
        ['second', {}]
      ])
    );

    hashedEnvironments.clear();
    await graph.executeAsync({ inputsSnapshot });
    expect(hashedEnvironments).toEqual(
      new Map([
        ['first', undefined],
        ['second', undefined]
      ])
    );
  });

  it('gives every iteration hook the environment lookup that the iteration was scheduled with', async () => {
    const graph: OperationGraph = createGraph([new EnvironmentRecordingRunner('operation')]);
    type GetOperationEnvironment = IOperationGraphIterationOptions['getOperationEnvironment'];
    const received: [string, GetOperationEnvironment][] = [];
    graph.hooks.configureIteration.tap('test', (records, lastResults, options) => {
      received.push(['configureIteration', options.getOperationEnvironment]);
    });
    graph.hooks.beforeExecuteIterationAsync.tapPromise('test', async (records, options) => {
      received.push(['beforeExecuteIterationAsync', options.getOperationEnvironment]);
    });
    graph.hooks.afterExecuteIterationAsync.tapPromise('test', async (status, records, options) => {
      received.push(['afterExecuteIterationAsync', options.getOperationEnvironment]);
      return status;
    });
    const getOperationEnvironment: GetOperationEnvironment = () => ({ [SESSION_VARIABLE]: 'A' });

    expect((await graph.executeAsync({ getOperationEnvironment })).status).toBe(OperationStatus.Success);
    expect((await graph.executeAsync({})).status).toBe(OperationStatus.Success);

    expect(received).toEqual([
      ['configureIteration', getOperationEnvironment],
      ['beforeExecuteIterationAsync', getOperationEnvironment],
      ['afterExecuteIterationAsync', getOperationEnvironment],
      ['configureIteration', undefined],
      ['beforeExecuteIterationAsync', undefined],
      ['afterExecuteIterationAsync', undefined]
    ]);
  });
});
