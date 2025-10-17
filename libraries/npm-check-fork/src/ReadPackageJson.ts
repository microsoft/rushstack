import _ from 'lodash';

import type { INpmCheckPackageJson } from './interfaces/INpmCheck.ts';

export default function readPackageJson(filename: string): INpmCheckPackageJson {
  let pkg: INpmCheckPackageJson | undefined = undefined;
  let error: Error | undefined = undefined;
  try {
    pkg = require(filename);
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'code' in e && e.code === 'MODULE_NOT_FOUND') {
      error = new Error(`A package.json was not found at ${filename}`);
    } else {
      error = new Error(`A package.json was found at ${filename}, but it is not valid.`);
    }
  }
  return _.extend({ devDependencies: {}, dependencies: {}, error: error }, pkg);
}
