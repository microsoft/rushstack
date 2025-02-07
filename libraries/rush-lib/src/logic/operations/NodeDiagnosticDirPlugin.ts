// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'path';

import { FileSystem } from '@rushstack/node-core-library';

import type { IPhasedCommandPlugin, PhasedCommandHooks } from '../../pluginFramework/PhasedCommandHooks';
import type { IEnvironment } from '../../utilities/Utilities';
import type { Operation } from './Operation';
import type { IOperationRunnerContext } from './IOperationRunner';
import type { IOperationExecutionResult } from './IOperationExecutionResult';

const PLUGIN_NAME: 'NodeDiagnosticDirPlugin' = 'NodeDiagnosticDirPlugin';

export interface INodeDiagnosticDirPluginOptions {
  diagnosticDir: string;
}

/**
 * Phased command plugin that configures the NodeJS --diagnostic-dir option to contain the project and phase name.
 */
export class NodeDiagnosticDirPlugin implements IPhasedCommandPlugin {
  private readonly _diagnosticsDir: string;

  public constructor(options: INodeDiagnosticDirPluginOptions) {
    this._diagnosticsDir = options.diagnosticDir;
  }

  public apply(hooks: PhasedCommandHooks): void {
    const getDiagnosticDir = (operation: Operation): string | undefined => {
      const { associatedProject } = operation;

      if (!associatedProject) {
        return;
      }

      const diagnosticDir: string = path.resolve(
        this._diagnosticsDir,
        associatedProject.packageName,
        operation.logFilenameIdentifier
      );

      return diagnosticDir;
    };

    hooks.beforeExecuteOperation.tap(
      PLUGIN_NAME,
      (operation: IOperationRunnerContext & IOperationExecutionResult): undefined => {
        const diagnosticDir: string | undefined = getDiagnosticDir(operation.operation);
        if (!diagnosticDir) {
          return;
        }

        // Not all versions of NodeJS create the directory, so ensure it exists:
        FileSystem.ensureFolder(diagnosticDir);
      }
    );

    hooks.createEnvironmentForOperation.tap(PLUGIN_NAME, (env: IEnvironment, operation: Operation) => {
      const diagnosticDir: string | undefined = getDiagnosticDir(operation);
      if (!diagnosticDir) {
        return env;
      }

      const { NODE_OPTIONS } = env;

      const diagnosticDirEnv: string = `--diagnostic-dir="${diagnosticDir}"`;

      env.NODE_OPTIONS = NODE_OPTIONS ? `${NODE_OPTIONS} ${diagnosticDirEnv}` : diagnosticDirEnv;

      return env;
    });
  }
}
