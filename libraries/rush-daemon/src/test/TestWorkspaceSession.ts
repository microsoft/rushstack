// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { RushConfiguration } from '@microsoft/rush-lib';
import type {
  IInputsSnapshot,
  IOperationGraph,
  RushSession
} from '@microsoft/rush-lib';

import type {
  IWorkspaceEngineShape,
  IWorkspaceInvalidationReconciliation
} from '../WorkspaceEngineComponentFactory';
import type {
  IWorkspaceSession,
  IWorkspaceSessionMetadata
} from '../WorkspaceSession';
import { WorkspaceInvalidationTracker } from '../WorkspaceInvalidationTracker';

export const TEST_REPO_ROOT: string = path.resolve(__dirname, '../../../..');
export const TEST_RUSH_CONFIGURATION: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
  path.join(TEST_REPO_ROOT, 'rush.json')
);

export class TestWorkspaceSession implements IWorkspaceSession {
  readonly #onDispose: (() => unknown) | undefined;

  public readonly engineShape: IWorkspaceEngineShape | undefined;
  public readonly inputsSnapshot: IInputsSnapshot | undefined;
  public readonly invalidations: WorkspaceInvalidationTracker = new WorkspaceInvalidationTracker();
  public readonly metadata: IWorkspaceSessionMetadata;
  public readonly operationGraph: IOperationGraph | undefined;
  public readonly rushConfiguration: RushConfiguration = TEST_RUSH_CONFIGURATION;
  public readonly rushSession: RushSession | undefined;

  public constructor(repoRoot: string, onDispose?: () => unknown) {
    this.#onDispose = onDispose;
    this.metadata = {
      projectCount: 0,
      projectNames: [],
      repoRoot,
      rushJsonFile: path.join(repoRoot, 'rush.json'),
      rushVersion: '5.178.0'
    };
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    await this.#onDispose?.();
  }

  public reconcileInvalidationsAsync(): Promise<IWorkspaceInvalidationReconciliation | undefined> {
    return Promise.resolve(undefined);
  }
}
