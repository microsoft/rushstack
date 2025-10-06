// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { INpmCheckPackageSummary } from './INpmCheckPackageSummary';

export interface INpmCheckPackageJson {
  name?: string;
  version?: string;
  devDependencies: Record<string, string>;
  dependencies: Record<string, string>;
  error?: Error;
  scripts?: Record<string, string>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export interface INpmCheckState {
  cwd: string;
  cwdPackageJson?: INpmCheckPackageJson;
  packages?: INpmCheckPackageSummary[];
}

export const DefaultNpmCheckOptions: INpmCheckState = {
  cwd: process.cwd(),
  cwdPackageJson: { devDependencies: {}, dependencies: {} },
  packages: undefined
};
