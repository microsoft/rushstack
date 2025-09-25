// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { Operation as OperationType, OperationStatus as OperationStatusType } from '@rushstack/rush-sdk';
import type { PnpmShrinkwrapFile as PnpmShrinkwrapFileType } from '@rushstack/rush-sdk/lib/logic/pnpm/PnpmShrinkwrapFile';
import type * as rushSdkType from '@rushstack/rush-sdk';

// Ultra-cheap "I am a Rush plugin" import of rush-lib
// eslint-disable-next-line @typescript-eslint/naming-convention
declare const ___rush___rushLibModule: typeof rushSdkType;

const { Operation, OperationStatus } = ___rush___rushLibModule;
// eslint-disable-next-line @typescript-eslint/no-redeclare
type Operation = OperationType;
// eslint-disable-next-line @typescript-eslint/no-redeclare
type OperationStatus = OperationStatusType;

export { Operation, OperationStatus };

// Support this plugin being webpacked.
const req: typeof require = typeof __non_webpack_require__ === 'function' ? __non_webpack_require__ : require;

const rushLibPath: string | undefined = process.env._RUSH_LIB_PATH;

function importDependency<TResult>(name: string): TResult {
  if (!rushLibPath) {
    throw new Error(`_RUSH_LIB_PATH variable is not set, cannot resolve rush-lib.`);
  }
  const externalPath: string = req.resolve(name, {
    paths: [rushLibPath]
  });

  return req(externalPath);
}

// Private Rush APIs
export const { PnpmShrinkwrapFile } = importDependency<
  typeof import('@rushstack/rush-sdk/lib/logic/pnpm/PnpmShrinkwrapFile')
>('@microsoft/rush-lib/lib/logic/pnpm/PnpmShrinkwrapFile');
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type PnpmShrinkwrapFile = PnpmShrinkwrapFileType;

// Avoid bundling expensive stuff that's already part of Rush.
export const { Async } = importDependency<typeof import('@rushstack/node-core-library/lib/Async')>(
  `@rushstack/node-core-library/lib/Async`
);
export const { FileSystem } = importDependency<typeof import('@rushstack/node-core-library/lib/FileSystem')>(
  `@rushstack/node-core-library/lib/FileSystem`
);
