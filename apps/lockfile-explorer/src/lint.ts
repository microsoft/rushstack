import { FileSystem, JsonFile, PackageJsonLookup } from '@rushstack/node-core-library';
import yaml from 'js-yaml';

import { init } from './init';
import { IAppState } from './state';
debugger;
import { generateLockfileGraph, linter, test } from './shared';

console.log('LINTING');
debugger;
test();

async function lintLockfile(): Promise<void> {
  const lockfileExplorerProjectRoot: string = PackageJsonLookup.instance.tryGetPackageFolderFor(__dirname)!;
  const appVersion: string = JsonFile.load(`${lockfileExplorerProjectRoot}/package.json`).version;

  const appState: IAppState = init({ lockfileExplorerProjectRoot, appVersion, debugMode: true });

  const pnpmLockfileText: string = await FileSystem.readFileAsync(appState.pnpmLockfileLocation);
  const doc = yaml.load(pnpmLockfileText);

  const lockfileGraph = generateLockfileGraph(doc);
  linter(lockfileGraph);
}

lintLockfile()
  .then(() => console.log())
  .catch((e) => {});
