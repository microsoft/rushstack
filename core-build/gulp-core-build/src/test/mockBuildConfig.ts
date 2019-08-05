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
