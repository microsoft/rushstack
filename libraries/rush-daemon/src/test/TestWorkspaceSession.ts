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
  IWorkspaceSession,
  IWorkspaceSessionMetadata
} from '../WorkspaceSession';
import { WorkspaceInvalidationTracker } from '../WorkspaceInvalidationTracker';

export const TEST_REPO_ROOT: string = path.resolve(__dirname, '../../../..');
export const TEST_RUSH_CONFIGURATION: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
  path.join(TEST_REPO_ROOT, 'rush.json')
);

export class TestWorkspaceSession implements IWorkspaceSession {
  private readonly _onDispose: (() => void) | undefined;

  public readonly inputsSnapshot: IInputsSnapshot | undefined;
  public readonly invalidations: WorkspaceInvalidationTracker = new WorkspaceInvalidationTracker();
  public readonly metadata: IWorkspaceSessionMetadata;
  public readonly operationGraph: IOperationGraph | undefined;
  public readonly rushConfiguration: RushConfiguration = TEST_RUSH_CONFIGURATION;
  public readonly rushSession: RushSession | undefined;

  public constructor(repoRoot: string, onDispose?: () => void) {
    this._onDispose = onDispose;
    this.metadata = {
      projectCount: 0,
      projectNames: [],
      repoRoot,
      rushJsonFile: path.join(repoRoot, 'rush.json'),
      rushVersion: '5.178.0'
    };
  }

  public disposeAsync(): Promise<void> {
    this._onDispose?.();
    return Promise.resolve();
  }
}
