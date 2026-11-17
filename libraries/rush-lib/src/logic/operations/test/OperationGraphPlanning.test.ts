// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock('../OperationStateFile');

import { MockWritable } from '@rushstack/terminal';

import type { IPhase } from '../../../api/CommandLineConfiguration';
import type { RushConfigurationProject } from '../../../api/RushConfigurationProject';
import { Operation } from '../Operation';
import { OperationGraph, type IOperationGraphOptions } from '../OperationGraph';
import { OperationStatus } from '../OperationStatus';
import { MockOperationRunner } from './MockOperationRunner';

const phase: IPhase = {
  name: 'phase',
  allowWarningsOnSuccess: false,
  associatedParameters: new Set(),
  dependencies: { self: new Set(), upstream: new Set() },
  isSynthetic: false,
  logFilenameIdentifier: 'phase',
  missingScriptBehavior: 'silent'
};

function createGraph(options: IOperationGraphOptions, runner: MockOperationRunner): OperationGraph {
  const operation: Operation = new Operation({
    runner,
    logFilenameIdentifier: 'operation',
    phase,
    project: { packageName: 'project' } as RushConfigurationProject
  });
  return new OperationGraph(new Set([operation]), options);
}

describe('OperationGraph external execution planning', () => {
  let graphOptions: IOperationGraphOptions;
  let writable: MockWritable;

  beforeEach(() => {
    writable = new MockWritable();
    graphOptions = {
      quietMode: true,
      debugMode: false,
      parallelism: 1,
      allowOversubscription: false,
      destinations: [writable],
      abortController: new AbortController()
    };
  });

  it('plans disabled operations without scheduling, executing hooks or exporting the ambient environment', async () => {
    const run = jest.fn(async () => OperationStatus.Success);
    const graph: OperationGraph = createGraph(graphOptions, new MockOperationRunner('planned', run));
    const environmentHook = jest.fn((environment) => environment);
    const beforeExecution = jest.fn();
    const beforeOperation = jest.fn();
    const afterExecution = jest.fn((status) => status);
    const scheduled = jest.fn();
    const event = jest.fn();
    graph.eventSink = { onOperationRegistered: event, onOperationStatusChanged: event };
    graph.hooks.createEnvironmentForOperation.tap('local-only', environmentHook);
    graph.hooks.beforeExecuteIterationAsync.tap('must-not-run', beforeExecution);
    graph.hooks.beforeExecuteOperationAsync.tap('must-not-run', beforeOperation);
    graph.hooks.afterExecuteIterationAsync.tap('must-not-run', afterExecution);
    graph.hooks.onIterationScheduled.tap('must-not-schedule', scheduled);
    graph.hooks.configureIteration.tap('configure-export', (records) => {
      for (const record of records.values()) {
        record.enabled = false;
        record.environmentOverrides = { EXPORTED_IDENTITY: 'generation' };
      }
    });

    const plan = await graph.createExecutionPlanAsync({});
    expect(plan.size).toBe(1);
    expect([...plan.values()][0]).toMatchObject({
      enabled: false,
      environmentOverrides: { EXPORTED_IDENTITY: 'generation' }
    });
    expect(graph.hasScheduledIteration).toBe(false);
    expect(graph.resultByOperation.size).toBe(0);
    expect(run).not.toHaveBeenCalled();
    expect(environmentHook).not.toHaveBeenCalled();
    expect(beforeExecution).not.toHaveBeenCalled();
    expect(beforeOperation).not.toHaveBeenCalled();
    expect(afterExecution).not.toHaveBeenCalled();
    expect(event).not.toHaveBeenCalled();
    expect(scheduled).not.toHaveBeenCalled();
    expect(writable.getAllOutput()).toBe('');
  });

  it('applies explicit overrides locally without reusing planned records or consuming iteration IDs', async () => {
    const runner: MockOperationRunner = new MockOperationRunner('planned');
    const execute = jest.spyOn(runner, 'executeAsync');
    const graph: OperationGraph = createGraph(graphOptions, runner);
    let generation: string = 'first';
    graph.hooks.configureIteration.tap('identity', (records) => {
      for (const record of records.values()) record.environmentOverrides = { EXPORTED_IDENTITY: generation };
    });
    graph.hooks.createEnvironmentForOperation.tap('local-only', (environment) => ({
      ...environment,
      EXPORTED_IDENTITY: 'must-not-override',
      LOCAL_ONLY: 'not-exported'
    }));

    const firstPlan = await graph.createExecutionPlanAsync({});
    const secondPlan = await graph.createExecutionPlanAsync({});
    expect([...secondPlan.values()][0].iterationId).toBe([...firstPlan.values()][0].iterationId);
    generation = 'second';
    await graph.executeAsync({});
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0][0].environment).toMatchObject({
      EXPORTED_IDENTITY: 'second',
      LOCAL_ONLY: 'not-exported'
    });
    expect([...graph.resultByOperation.values()][0].iterationId).toBe([...firstPlan.values()][0].iterationId);
    expect([...firstPlan.values()][0].environmentOverrides).toEqual({ EXPORTED_IDENTITY: 'first' });
  });

  it('returns an empty plan without scheduling an empty iteration', async () => {
    const graph: OperationGraph = new OperationGraph(new Set(), graphOptions);
    await expect(graph.createExecutionPlanAsync({})).resolves.toHaveProperty('size', 0);
    expect(graph.hasScheduledIteration).toBe(false);
  });

  it('rejects planning while an iteration is scheduled or active, or after abort', async () => {
    const runner: MockOperationRunner = new MockOperationRunner('planned');
    const graph: OperationGraph = createGraph({ ...graphOptions, pauseNextIteration: true }, runner);
    await graph.scheduleIterationAsync({});
    await expect(graph.createExecutionPlanAsync({})).rejects.toThrow(/active or scheduled/);
    let activeCheck: Promise<void> | undefined;
    graph.hooks.beforeExecuteIterationAsync.tap('check-active', () => {
      activeCheck = expect(graph.createExecutionPlanAsync({})).rejects.toThrow(/active or scheduled/);
    });
    await graph.executeScheduledIterationAsync();
    await activeCheck;
    graph.abortController.abort();
    await expect(graph.createExecutionPlanAsync({})).rejects.toThrow();
  });

  it('propagates configuration failure without scheduling or replacing previous results', async () => {
    const graph: OperationGraph = createGraph(graphOptions, new MockOperationRunner('planned'));
    await graph.executeAsync({});
    const previousResults = new Map(graph.resultByOperation);
    graph.hooks.configureIteration.tap('fail', () => {
      throw new Error('Invalid external configuration');
    });
    await expect(graph.createExecutionPlanAsync({})).rejects.toThrow('Invalid external configuration');
    expect(graph.resultByOperation).toEqual(previousResults);
    expect(graph.hasScheduledIteration).toBe(false);
  });
});
