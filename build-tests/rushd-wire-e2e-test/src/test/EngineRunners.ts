// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// Inline operation runners that use runWithTerminalAsync, matching the
// production runners (ShellOperationRunner, IPCOperationRunner).

import * as os from 'node:os';

import type { RushConfigurationProject } from '@microsoft/rush-lib/lib/api/RushConfigurationProject';
import type {
  IOperationRunner,
  IOperationRunnerContext
} from '@microsoft/rush-lib/lib/logic/operations/IOperationRunner';
import { Operation } from '@microsoft/rush-lib/lib/logic/operations/Operation';
import type { OperationStatus } from '@microsoft/rush-lib/lib/logic/operations/OperationStatus';

function createRunner(name: string, status: OperationStatus): IOperationRunner {
  return {
    name,
    reportTiming: true,
    silent: false,
    cacheable: false,
    warningsAreAllowed: false,
    isNoOp: false,
    executeAsync: async (context: IOperationRunnerContext) =>
      await context.runWithTerminalAsync(
        async (terminal) => {
          terminal.writeLine(`${name}-out ünïcode ✓`);
          terminal.writeErrorLine(`${name}-err`);
          return status;
        },
        { createLogFile: false, logFileSuffix: '' }
      ),
    getConfigHash: () => 'e2e'
  };
}

/** Creates a fixture operation writing deterministic unicode output. */
export function createScenarioOperation(name: string, status: OperationStatus): Operation {
  return new Operation({
    runner: createRunner(name, status),
    logFilenameIdentifier: name,
    phase: {
      name: 'phase',
      allowWarningsOnSuccess: false,
      associatedParameters: new Set(),
      dependencies: { self: new Set(), upstream: new Set() },
      isSynthetic: false,
      logFilenameIdentifier: 'phase',
      missingScriptBehavior: 'silent'
    },
    project: {
      packageName: name,
      projectFolder: os.tmpdir()
    } as unknown as RushConfigurationProject
  });
}
