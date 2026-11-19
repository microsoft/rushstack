// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IPhase } from '../../../api/CommandLineConfiguration';
import type { RushConfigurationProject } from '../../../api/RushConfigurationProject';
import type { IOperationSettings } from '../../../api/RushProjectConfiguration';
import { Operation } from '../Operation';
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

describe('Operation weight assignment', () => {
  it('applies numeric weight from operation settings', () => {
    const project: RushConfigurationProject = createProject('project-number');
    const operation: Operation = createOperation({
      project,
      settings: {
        operationName: MOCK_PHASE.name,
        weight: 7
      }
    });

    expect(operation.weight).toBe(7);
  });

  it('parses percentage weight as a scalar', () => {
    const project: RushConfigurationProject = createProject('project-percent');
    const operation: Operation = createOperation({
      project,
      settings: {
        operationName: MOCK_PHASE.name,
        weight: '25%'
      } as IOperationSettings
    });

    expect(operation.weight).toEqual({ scalar: 0.25 });
  });

  it('parses 50% weight as scalar 0.5', () => {
    const project: RushConfigurationProject = createProject('project-config');
    const operation: Operation = createOperation({
      project,
      settings: {
        operationName: MOCK_PHASE.name,
        weight: '50%'
      } as IOperationSettings
    });

    expect(operation.weight).toEqual({ scalar: 0.5 });
  });

  it('parses fractional percentage weight as a scalar', () => {
    const project: RushConfigurationProject = createProject('project-floor');
    const operation: Operation = createOperation({
      project,
      settings: {
        operationName: MOCK_PHASE.name,
        weight: '33.3333%'
      } as IOperationSettings
    });

    expect(operation.weight).toEqual({ scalar: 0.333333 });
  });

  it('throws for invalid percentage weight format', () => {
    const project: RushConfigurationProject = createProject('project-invalid');
    expect(() => {
      createOperation({
        project,
        // @ts-expect-error Testing invalid input
        settings: {
          operationName: MOCK_PHASE.name,
          weight: '12.5a%'
        } as IOperationSettings
      });
    }).toThrow(/invalid weight for operation/i);
  });
});
