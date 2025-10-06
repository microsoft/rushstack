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

export interface INpmCheckOptions {
  cwd: string;
}

// Removed
// - global
// - globalPackages
// - devOnly
// - ignore
// - ignoreDev
// - unusedDependencies
// - missingFromPackageJson
// - spinner
// - emoji
// - forceColor
// - saveExact
// from INpmCheckState as they were not used anywhere
export interface INpmCheckState {
  update?: boolean;
  updateAll?: boolean;
  cwd: string;
  specials?: string;
  debug?: boolean;
  installer?: string;
  cwdPackageJson?: INpmCheckPackageJson;
  packages?: INpmCheckPackageSummary[];
}

export const DefaultNpmCheckOptions: INpmCheckState = {
  update: false,
  updateAll: false,
  cwd: process.cwd(),
  specials: '',
  debug: false,
  installer: 'npm',
  cwdPackageJson: { devDependencies: {}, dependencies: {} },
  packages: undefined
};
