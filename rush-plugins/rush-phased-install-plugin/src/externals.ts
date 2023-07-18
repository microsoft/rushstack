// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// This file is purely for optimizing the loading of this code when running inside of Rush.

import type { ChildProcess } from 'node:child_process';
import type Module from 'node:module';
import type { Operation as OperationType, OperationStatus as OperationStatusType } from '@rushstack/rush-sdk';
import type * as rushSdkType from '@rushstack/rush-sdk';
import type { IPnpmLockYaml } from './types';

// Ultra-cheap "I am a Rush plugin" import of rush-lib
// eslint-disable-next-line @typescript-eslint/naming-convention
declare const ___rush___rushLibModule: typeof rushSdkType;

const { Operation, OperationStatus } = ___rush___rushLibModule;
// eslint-disable-next-line @typescript-eslint/no-redeclare
type Operation = OperationType;
// eslint-disable-next-line @typescript-eslint/no-redeclare
type OperationStatus = OperationStatusType;

export { Operation, OperationStatus };

// eslint-disable-next-line @typescript-eslint/naming-convention
declare const __non_webpack_require__: typeof require;

const entryModule: Module = __non_webpack_require__.main!;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getExternal(name: string): any {
  const externalPath: string = __non_webpack_require__.resolve(name, {
    paths: entryModule.paths
  });

  return __non_webpack_require__(externalPath);
}

// Private Rush APIs
export const PnpmShrinkwrapFile: {
  loadFromString(data: string): IPnpmLockYaml;
} = getExternal('@microsoft/rush-lib/lib/logic/pnpm/PnpmShrinkwrapFile').PnpmShrinkwrapFile;

export const Utilities: {
  executeLifecycleCommandAsync(
    command: string,
    options: {
      rushConfiguration: undefined;
      workingDirectory: string;
      initCwd: string;
      handleOutput: boolean;
      environmentPathOptions?: {
        additionalPathFolders: string[];
      };
    }
  ): ChildProcess;
} = getExternal('@microsoft/rush-lib/lib/utilities/Utilities').Utilities;

// Avoid bundling expensive stuff that's already part of Rush.
export const Async: typeof import('@rushstack/node-core-library/lib/Async').Async = getExternal(
  `@rushstack/node-core-library/lib/Async`
).Async;

export const JsonFile: typeof import('@rushstack/node-core-library/lib/JsonFile').JsonFile = getExternal(
  `@rushstack/node-core-library/lib/JsonFile`
).JsonFile;
