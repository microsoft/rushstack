// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import os from 'node:os';

import type { IPhase } from '../../../api/CommandLineConfiguration';
import type { RushConfigurationProject } from '../../../api/RushConfigurationProject';
import type { IOperationSettings, RushProjectConfiguration } from '../../../api/RushProjectConfiguration';
import {
  type IExecuteOperationsContext,
  PhasedCommandHooks
} from '../../../pluginFramework/PhasedCommandHooks';
import type { IOperationExecutionResult } from '../IOperationExecutionResult';
import { Operation } from '../Operation';
import { WeightedOperationPlugin } from '../WeightedOperationPlugin';
import { MockOperationRunner } from './MockOperationRunner';

const MOCK_PHASE: IPhase = {
  name: '_phase:test',
  allowWarningsOnSuccess: false,
  associatedParameters: new Set(),
  dependencies: {
    self: new Set(),
    upstream: new Set()
  },
  isSynthetic: false,
  logFilenameIdentifier: '_phase_test',
  missingScriptBehavior: 'silent'
};

function createProject(packageName: string): RushConfigurationProject {
  return {
    packageName
  } as RushConfigurationProject;
}

function createOperation(options: {
  project: RushConfigurationProject;
  settings?: IOperationSettings;
  isNoOp?: boolean;
}): Operation {
  const { project, settings, isNoOp } = options;
  return new Operation({
    phase: MOCK_PHASE,
    project,
    settings,
    runner: new MockOperationRunner(`${project.packageName} (${MOCK_PHASE.name})`, undefined, false, isNoOp),
    logFilenameIdentifier: `${project.packageName}_phase_test`
  });
}

function createExecutionRecords(operation: Operation): Map<Operation, IOperationExecutionResult> {
  return new Map([
    [
      operation,
      {
        operation,
        runner: operation.runner
      } as unknown as IOperationExecutionResult
    ]
  ]);
}

function createContext(
  projectConfigurations: ReadonlyMap<RushConfigurationProject, RushProjectConfiguration>,
  parallelism: number = os.availableParallelism()
): IExecuteOperationsContext {
  return {
    projectConfigurations,
    parallelism
  } as IExecuteOperationsContext;
}

async function applyWeightPluginAsync(
  operations: Map<Operation, IOperationExecutionResult>,
  context: IExecuteOperationsContext
): Promise<void> {
  const hooks: PhasedCommandHooks = new PhasedCommandHooks();
  new WeightedOperationPlugin().apply(hooks);
  await hooks.beforeExecuteOperations.promise(operations, context);
}

function mockAvailableParallelism(value: number): jest.SpyInstance<number, []> {
  return jest.spyOn(os, 'availableParallelism').mockReturnValue(value);
}

describe(WeightedOperationPlugin.name, () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('applies numeric weight from operation settings', async () => {
    const project: RushConfigurationProject = createProject('project-number');
    const operation: Operation = createOperation({
      project,
      settings: {
        operationName: MOCK_PHASE.name,
        weight: 7
      }
    });

    await applyWeightPluginAsync(
      createExecutionRecords(operation),
      createContext(new Map(), /* Set parallelism to ensure -p does not affect weight calculation */ 1)
    );

    expect(operation.weight).toBe(7);
  });

  it('converts percentage weight using available parallelism', async () => {
    mockAvailableParallelism(10);

    const project: RushConfigurationProject = createProject('project-percent');
    const operation: Operation = createOperation({
      project,
      settings: {
        operationName: MOCK_PHASE.name,
        weight: '25%'
      } as IOperationSettings
    });

    await applyWeightPluginAsync(createExecutionRecords(operation), createContext(new Map()));

    expect(operation.weight).toBe(2);
  });

  it('reads weight from rush-project configuration when operation settings are undefined', async () => {
    mockAvailableParallelism(8);

    const project: RushConfigurationProject = createProject('project-config');
    const operation: Operation = createOperation({ project });
    const projectConfiguration: RushProjectConfiguration = {
      operationSettingsByOperationName: new Map([
        [
          MOCK_PHASE.name,
          {
            operationName: MOCK_PHASE.name,
            weight: '50%'
          } as IOperationSettings
        ]
      ])
    } as unknown as RushProjectConfiguration;

    await applyWeightPluginAsync(
      createExecutionRecords(operation),
      createContext(new Map([[project, projectConfiguration]]))
    );

    expect(operation.weight).toBe(4);
  });

  it('use ceiling when converting percentage weight to avoid zero weight', async () => {
    mockAvailableParallelism(16);

    const project: RushConfigurationProject = createProject('project-ceiling');
    const operation: Operation = createOperation({
      project,
      settings: {
        operationName: MOCK_PHASE.name,
        weight: '33.3333%'
      } as IOperationSettings
    });

    await applyWeightPluginAsync(createExecutionRecords(operation), createContext(new Map()));

    expect(operation.weight).toBe(5);
  });

  it('forces NO-OP operation weight to zero ignore weight settings', async () => {
    const project: RushConfigurationProject = createProject('project-no-op');
    const operation: Operation = createOperation({
      project,
      isNoOp: true,
      settings: {
        operationName: MOCK_PHASE.name,
        weight: 100
      }
    });

    await applyWeightPluginAsync(createExecutionRecords(operation), createContext(new Map()));

    expect(operation.weight).toBe(0);
  });

  it('throws for invalid percentage weight format', async () => {
    mockAvailableParallelism(16);

    const project: RushConfigurationProject = createProject('project-invalid');
    const operation: Operation = createOperation({
      project,
      // @ts-expect-error Testing invalid input
      settings: {
        operationName: MOCK_PHASE.name,
        weight: '12.5a%'
      } as IOperationSettings
    });

    await expect(
      applyWeightPluginAsync(createExecutionRecords(operation), createContext(new Map()))
    ).rejects.toThrow(/invalid weight: 12.5a%/i);
  });
});
