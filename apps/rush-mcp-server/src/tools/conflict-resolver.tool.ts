// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { z } from 'zod';

import type { RushConfiguration } from '@rushstack/rush-sdk';
import type { IExecutableSpawnSyncOptions } from '@rushstack/node-core-library';

import { CommandRunner } from '../utilities/command-runner';
import { getRushConfiguration } from '../utilities/common';
import { BaseTool, type CallToolResult } from './base.tool';

export class RushConflictResolverTool extends BaseTool {
  public constructor() {
    super({
      name: 'rush_pnpm_lock_file_conflict_resolver',
      description:
        'If a user requests to resolve a pnpm-lock.yaml file conflict, use this tool to automatically fix the conflict directly.',
      schema: {
        lockfilePath: z.string().describe('The path to the pnpm-lock.yaml file, should pass absolute path')
      }
    });
  }

  private _tryGetSubspaceNameFromLockfilePath(
    lockfilePath: string,
    rushConfiguration: RushConfiguration
  ): string | null {
    for (const subspace of rushConfiguration.subspaces) {
      const folderPath: string = subspace.getSubspaceConfigFolderPath();
      if (lockfilePath.startsWith(folderPath)) {
        return subspace.subspaceName;
      }
    }
    return null;
  }

  public async executeAsync({ lockfilePath }: { lockfilePath: string }): Promise<CallToolResult> {
    const rushConfiguration: RushConfiguration = await getRushConfiguration();
    const subspaceName: string | null = this._tryGetSubspaceNameFromLockfilePath(
      lockfilePath,
      rushConfiguration
    );
    if (!subspaceName) {
      throw new Error('subspace name not found');
    }

    const options: IExecutableSpawnSyncOptions = {
      stdio: 'inherit',
      currentWorkingDirectory: rushConfiguration.rushJsonFolder
    };
    await CommandRunner.runGitCommandAsync(['checkout', '--theirs', lockfilePath], options);
    await CommandRunner.runRushCommandAsync(['update', '--subspace', subspaceName], options);

    return {
      content: [
        {
          type: 'text',
          text: 'Conflict resolved successfully'
        }
      ]
    };
  }
}
