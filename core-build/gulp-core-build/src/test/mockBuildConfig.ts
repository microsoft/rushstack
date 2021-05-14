// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as gulp from 'gulp';

import { IBuildConfig } from './../IBuildConfig';

export const mockBuildConfig: IBuildConfig = {
  maxBuildTimeMs: 5 * 1000,
  gulp,
  rootPath: '',
  packageFolder: '',
  srcFolder: 'src',
  libFolder: 'lib',
  distFolder: 'dist',
  tempFolder: 'temp',
  verbose: false,
  production: false,
  args: {},
  shouldWarningsFailBuild: false
};
