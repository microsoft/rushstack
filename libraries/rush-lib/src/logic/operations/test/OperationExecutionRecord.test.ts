// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IPhase } from '../../../api/CommandLineConfiguration';
import type { RushConfigurationProject } from '../../../api/RushConfigurationProject';
import type { IOperationSettings } from '../../../api/RushProjectConfiguration';
import { Operation } from '../Operation';
import { type IOperationExecutionRecordContext, OperationExecutionRecord } from '../OperationExecutionRecord';
import {
  getCommandExecution,
  setIncrementalExecutionGuard,
  wasExecutedIncrementally,
  type IIncrementalExecutionGuard
} from '../IncrementalExecutionState';
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

function createRecord(operation: Operation, maxParallelism: number = 8): OperationExecutionRecord {
  return new OperationExecutionRecord(operation, {
    maxParallelism
  } as unknown as IOperationExecutionRecordContext);
}

describe(OperationExecutionRecord.name, () => {
  describe('weight', () => {
    it('snapshots numeric operation weight for a normal (non-no-op) operation', () => {
      const project: RushConfigurationProject = createProject('project-normal');
      const operation: Operation = createOperation({
        project,
        settings: {
          operationName: MOCK_PHASE.name,
          weight: 3
        }
      });

      const record: OperationExecutionRecord = createRecord(operation);
      expect(record.weight).toBe(3);
    });

    it('coerces percentage weight to integer slots using maxParallelism', () => {
      // 25% of 8 slots = floor(0.25 * 8) = 2
      const project: RushConfigurationProject = createProject('project-percent');
      const operation: Operation = createOperation({
        project,
        settings: {
          operationName: MOCK_PHASE.name,
          weight: '25%'
        } as IOperationSettings
      });

      const record: OperationExecutionRecord = createRecord(operation, 8);
      expect(record.weight).toBe(2);
    });

    it('coerces weight to 0 for no-op operations regardless of operation weight', () => {
      const project: RushConfigurationProject = createProject('project-noop');
      const operation: Operation = createOperation({
        project,
        settings: {
          operationName: MOCK_PHASE.name,
          weight: 5
        },
        isNoOp: true
      });

      const record: OperationExecutionRecord = createRecord(operation);
      expect(record.weight).toBe(0);
    });

    it('snapshots default weight (1) for a normal operation with no weight setting', () => {
      const project: RushConfigurationProject = createProject('project-default');
      const operation: Operation = createOperation({ project });

      const record: OperationExecutionRecord = createRecord(operation);
      expect(record.weight).toBe(1);
    });

    it('coerces weight to 0 for no-op operations even with default weight', () => {
      const project: RushConfigurationProject = createProject('project-noop-default');
      const operation: Operation = createOperation({ project, isNoOp: true });

      const record: OperationExecutionRecord = createRecord(operation);
      expect(record.weight).toBe(0);
    });

    it('uses the graph maxParallelism (not OS core count) when coercing percentage weights', () => {
      // 50% of 4 slots = floor(0.5 * 4) = 2, not floor(0.5 * <os cores>)
      const project: RushConfigurationProject = createProject('project-graph-max');
      const operation: Operation = createOperation({
        project,
        settings: {
          operationName: MOCK_PHASE.name,
          weight: '50%'
        } as IOperationSettings
      });

      const record: OperationExecutionRecord = createRecord(operation, 4);
      expect(record.weight).toBe(2);
    });
  });

  describe('incremental execution', () => {
    it('returns the incremental execution guard that a plugin registered for the record', () => {
      const operation: Operation = createOperation({ project: createProject('project-guarded') });
      const record: OperationExecutionRecord = createRecord(operation);
      expect(record.getIncrementalExecutionGuard()).toBeUndefined();

      const guard: IIncrementalExecutionGuard = {
        getBlockReasonAsync: async () => undefined,
        verifyIncrementalResultAsync: async () => undefined
      };
      setIncrementalExecutionGuard(record, guard);
      expect(record.getIncrementalExecutionGuard()).toBe(guard);
      // The guard belongs to the record of one iteration, not to the operation.
      expect(createRecord(operation).getIncrementalExecutionGuard()).toBeUndefined();
    });

    it('records the command execution that the runner reports', () => {
      const record: OperationExecutionRecord = createRecord(
        createOperation({ project: createProject('project-reported') })
      );
      expect(getCommandExecution(record)).toBeUndefined();

      record.reportCommandExecution({ kind: 'incremental', hasIncrementalCommand: true });
      expect(getCommandExecution(record)).toEqual({ kind: 'incremental', hasIncrementalCommand: true });
      expect(wasExecutedIncrementally(record)).toBe(true);

      // The last report counts, e.g. when the guard made the runner run its initial command after the incremental one.
      record.reportCommandExecution({ kind: 'initial', hasIncrementalCommand: true });
      expect(wasExecutedIncrementally(record)).toBe(false);
    });

    it('records whether the runner reports that the command ran in a process that watches the input files', () => {
      const record: OperationExecutionRecord = createRecord(
        createOperation({ project: createProject('project-watching') })
      );

      record.reportCommandExecution({
        kind: 'incremental',
        hasIncrementalCommand: true,
        watchesInputs: true
      });
      expect(getCommandExecution(record)?.watchesInputs).toBe(true);

      record.reportCommandExecution({ kind: 'initial', hasIncrementalCommand: true });
      expect(getCommandExecution(record)?.watchesInputs).toBeUndefined();
    });
  });
});
