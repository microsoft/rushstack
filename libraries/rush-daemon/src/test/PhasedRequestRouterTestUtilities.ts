// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { MockWritable } from '@rushstack/terminal';
import type { ITerminal } from '@rushstack/terminal';
import type {
  IInputsSnapshot,
  IOperationGraph,
  IOperationRunner,
  IOperationRunnerContext,
  IPhase,
  RushConfiguration,
  RushSession
} from '@microsoft/rush-lib';
import { Operation, OperationStatus } from '@microsoft/rush-lib';
import { OperationGraph } from '@microsoft/rush-lib/lib/logic/operations/OperationGraph';
import type { IOperationGraphOptions } from '@microsoft/rush-lib/lib/logic/operations/OperationGraph';
import type {
  IDaemonEventEnvelope,
  IDaemonPhasedRequestResult
} from '@rushstack/rush-daemon-protocol';

import type { IPhasedRequestClient } from '../PhasedRequestClient';
import type {
  IWorkspaceEngineShape,
  IWorkspaceInvalidationReconciliation
} from '../WorkspaceEngineComponentFactory';
import type {
  IWorkspaceSession,
  IWorkspaceSessionMetadata
} from '../WorkspaceSession';
import { WorkspaceInvalidationTracker } from '../WorkspaceInvalidationTracker';
import { TEST_RUSH_CONFIGURATION, TEST_REPO_ROOT } from './TestWorkspaceSession';

export const TEST_ENGINE_SHAPE: IWorkspaceEngineShape = {
  phaseNames: ['_phase:test'],
  pluginNames: ['test-plugin']
};

const TEST_PHASE: IPhase = {
  allowWarningsOnSuccess: false,
  associatedParameters: new Set(),
  dependencies: { self: new Set(), upstream: new Set() },
  isSynthetic: false,
  logFilenameIdentifier: '_phase_test',
  missingScriptBehavior: 'silent',
  name: TEST_ENGINE_SHAPE.phaseNames[0]
};

export interface ITestClientWrite {
  readonly event?: IDaemonEventEnvelope;
  readonly operationId?: string;
  readonly result?: IDaemonPhasedRequestResult;
  readonly stream?: 'stdout' | 'stderr';
  readonly text?: string;
}

export class TestPhasedRequestClient implements IPhasedRequestClient {
  public readonly abortController: AbortController = new AbortController();
  public readonly sessionId: string = 'test-session';
  public readonly writes: ITestClientWrite[] = [];
  public onWriteAsync: ((write: ITestClientWrite) => Promise<void>) | undefined;
  readonly #sequenceState: { next: number };

  public constructor(sequenceState: { next: number } = { next: 1 }) {
    this.#sequenceState = sequenceState;
  }

  public get abortSignal(): AbortSignal {
    return this.abortController.signal;
  }

  public getNextEventSequence(): number {
    const sequence: number = this.#sequenceState.next;
    this.#sequenceState.next = sequence + 1;
    return sequence;
  }

  public async writeEventAsync(event: IDaemonEventEnvelope): Promise<void> {
    const write: ITestClientWrite = { event };
    await this.onWriteAsync?.(write);
    this.writes.push(write);
  }

  public async writeLogChunkAsync(
    operationId: string,
    stream: 'stdout' | 'stderr',
    chunk: Uint8Array
  ): Promise<void> {
    const write: ITestClientWrite = {
      operationId,
      stream,
      text: new TextDecoder().decode(chunk)
    };
    await this.onWriteAsync?.(write);
    this.writes.push(write);
  }

  public async writeResultAsync(result: IDaemonPhasedRequestResult): Promise<void> {
    const write: ITestClientWrite = { result };
    await this.onWriteAsync?.(write);
    this.writes.push(write);
  }
}

export class TestOperationRunner implements IOperationRunner {
  public readonly cacheable: boolean = false;
  public readonly reportTiming: boolean = true;
  public readonly silent: boolean = false;
  public readonly warningsAreAllowed: boolean = false;
  public closeCount: number = 0;
  public runCount: number = 0;

  readonly #actionAsync: ((terminal: ITerminal) => Promise<void>) | undefined;
  readonly #status: OperationStatus;
  public readonly name: string;

  public constructor(
    name: string,
    status: OperationStatus = OperationStatus.Success,
    actionAsync?: (terminal: ITerminal) => Promise<void>
  ) {
    this.name = name;
    this.#status = status;
    this.#actionAsync = actionAsync;
  }

  public closeAsync(): Promise<void> {
    this.closeCount++;
    return Promise.resolve();
  }

  public executeAsync(context: IOperationRunnerContext): Promise<OperationStatus> {
    this.runCount++;
    return context.runWithTerminalAsync(
      async (terminal: ITerminal): Promise<OperationStatus> => {
        await this.#actionAsync?.(terminal);
        return this.#status;
      },
      { createLogFile: false, logFileSuffix: '' }
    );
  }

  public getConfigHash(): string {
    return this.name;
  }
}

export interface ITestRoutingFixture {
  readonly graph: OperationGraph;
  readonly operations: ReadonlyMap<string, Operation>;
  readonly runners: ReadonlyMap<string, TestOperationRunner>;
  readonly session: TestRoutingWorkspaceSession;
}

export class TestRoutingWorkspaceSession implements IWorkspaceSession {
  public readonly engineShape: IWorkspaceEngineShape = TEST_ENGINE_SHAPE;
  public readonly inputsSnapshot: IInputsSnapshot | undefined = undefined;
  public readonly invalidations: WorkspaceInvalidationTracker = new WorkspaceInvalidationTracker();
  public readonly metadata: IWorkspaceSessionMetadata = {
    projectCount: 3,
    projectNames: ['project-a', 'project-b', 'project-c'],
    repoRoot: TEST_REPO_ROOT,
    rushJsonFile: TEST_RUSH_CONFIGURATION.rushJsonFile,
    rushVersion: '5.178.1'
  };
  public readonly rushConfiguration: RushConfiguration = TEST_RUSH_CONFIGURATION;
  public readonly rushSession: RushSession | undefined = undefined;
  public readonly operationGraph: IOperationGraph;
  public onReconcileAsync: (() => Promise<void>) | undefined;

  public constructor(operationGraph: IOperationGraph) {
    this.operationGraph = operationGraph;
  }

  public async reconcileInvalidationsAsync(): Promise<
    IWorkspaceInvalidationReconciliation | undefined
  > {
    await this.onReconcileAsync?.();
    return undefined;
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    this.operationGraph.abortController.abort();
    await this.operationGraph.abortCurrentIterationAsync();
    await this.operationGraph.closeRunnersAsync();
  }
}

export function createRoutingFixture(
  runnerById: ReadonlyMap<string, TestOperationRunner>,
  dependencies: ReadonlyArray<readonly [string, string]> = []
): ITestRoutingFixture {
  const operations: Map<string, Operation> = new Map();
  const runners: Map<string, TestOperationRunner> = new Map(runnerById);
  let projectIndex: number = 0;
  for (const [operationId, runner] of runners) {
    const project = TEST_RUSH_CONFIGURATION.projects[projectIndex++];
    if (!project) {
      throw new Error('The test Rush configuration does not have enough projects.');
    }
    operations.set(
      operationId,
      new Operation({
        logFilenameIdentifier: operationId,
        phase: TEST_PHASE,
        project,
        runner
      })
    );
  }
  for (const [consumerId, dependencyId] of dependencies) {
    const consumer: Operation | undefined = operations.get(consumerId);
    const dependency: Operation | undefined = operations.get(dependencyId);
    if (!consumer || !dependency) {
      throw new Error('The test dependency references an unknown operation.');
    }
    consumer.addDependency(dependency);
  }

  const graphOptions: IOperationGraphOptions = {
    abortController: new AbortController(),
    allowOversubscription: true,
    debugMode: false,
    destinations: [new MockWritable()],
    parallelism: 1,
    pauseNextIteration: false,
    quietMode: false
  };
  // The package's bundled public declarations and deep-import declarations describe the same runtime classes,
  // but TypeScript assigns them distinct recursive identities.
  const graph: OperationGraph = new OperationGraph(
    new Set(operations.values()) as unknown as ConstructorParameters<typeof OperationGraph>[0],
    graphOptions
  );
  const publicGraph: IOperationGraph = graph as unknown as IOperationGraph;
  return {
    graph,
    operations,
    runners,
    session: new TestRoutingWorkspaceSession(publicGraph)
  };
}
