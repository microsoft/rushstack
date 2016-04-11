import { argv as clArgs } from 'yargs';
import * as path from 'path';

export let root = process.cwd();
export let args = clArgs;

export interface IPackageJSON {
  name: string;
  version: string;
}

export let builtPackage: IPackageJSON = require(path.join(root, 'package.json'));
export let coreBuildPackage: IPackageJSON = require('../package.json');
export let nodeVersion = process.version;
