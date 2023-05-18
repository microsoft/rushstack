import { FileSystem, JsonFile, PackageJsonLookup } from '@rushstack/node-core-library';
import { RushConfiguration } from '@microsoft/rush-lib';
import yaml from 'js-yaml';
import path from 'path';

import { init } from './init';
import { IAppState } from './state';

import { generateLockfileGraph, linter } from './shared';

async function lintLockfile(): Promise<void> {
  const lockfileExplorerProjectRoot: string = PackageJsonLookup.instance.tryGetPackageFolderFor(__dirname)!;
  const appVersion: string = JsonFile.load(`${lockfileExplorerProjectRoot}/package.json`).version;

  const appState: IAppState = init({ lockfileExplorerProjectRoot, appVersion, debugMode: true });

  const pnpmLockfileText: string = await FileSystem.readFileAsync(appState.pnpmLockfileLocation);
  const doc = yaml.load(pnpmLockfileText);

  const lockfileGraph = generateLockfileGraph(doc);
  const output = linter(lockfileGraph, false) as string;
  const workspaceRoot = path.dirname(RushConfiguration.tryFindRushJsonLocation() as string);

  await FileSystem.writeFileAsync(`${workspaceRoot}/lockfileLint.json`, output);
}

lintLockfile().catch((e) => {});
