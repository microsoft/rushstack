import * as gulp from 'gulp';

import { IBuildConfig } from './../IBuildConfig';

export const mockBuildConfig: IBuildConfig = {
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
