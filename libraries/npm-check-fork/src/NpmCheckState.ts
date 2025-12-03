import path from 'node:path';

import _ from 'lodash';

import {
  DefaultNpmCheckOptions,
  type INpmCheckPackageJson,
  type INpmCheckState
} from './interfaces/INpmCheck';
import readPackageJson from './ReadPackageJson';

export default async function initializeState(initialOptions?: INpmCheckState): Promise<INpmCheckState> {
  const state: INpmCheckState = _.extend(DefaultNpmCheckOptions, initialOptions);

  if (state.cwd) {
    const cwd: string = path.resolve(state.cwd);
    const pkg: INpmCheckPackageJson = readPackageJson(path.join(cwd, 'package.json'));
    state.cwdPackageJson = pkg;
    state.cwd = cwd;
  }

  if (state.cwdPackageJson?.error) {
    return Promise.reject(state.cwdPackageJson.error);
  }

  return Promise.resolve(state);
}
