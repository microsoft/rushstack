// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IPackageJson } from '@rushstack/node-core-library';

export interface IReadPackageContext {
  log: (message: string) => void;
}

export type IReadPackageHook = (
  packageJson: IPackageJson,
  context: IReadPackageContext
) => IPackageJson | Promise<IPackageJson>;

export interface IPnpmHooks {
  readPackage?: IReadPackageHook;
}

/**
 * Type of the `.pnpmfile.cjs` module.
 */
export interface IPnpmfileModule {
  hooks?: IPnpmHooks;
}
