import { AlreadyReportedError, FileSystem, JsonFile, PackageJsonLookup } from '@rushstack/node-core-library';
import yaml from 'js-yaml';
import path from 'path';
import colors from 'colors';

import { init } from './init';
import { IAppState } from './state';

import { generateLockfileGraph, linter } from './shared';

// This is based on RushConfiguration.tryFindRushJsonLocation(), but since we only need this
// one small function, it was easier to make a copy of the code.
function tryFindRushJsonLocation(): string | undefined {
  let currentFolder: string = process.cwd();

  // Look upwards at parent folders until we find a folder containing rush.json
  for (let i: number = 0; i < 10; ++i) {
    const rushJsonFilename: string = path.join(currentFolder, 'rush.json');

    if (FileSystem.exists(rushJsonFilename)) {
      return rushJsonFilename;
    }

    const parentFolder: string = path.dirname(currentFolder);
    if (parentFolder === currentFolder) {
      break;
    }

    currentFolder = parentFolder;
  }

  return undefined;
}

async function lintLockfile(): Promise<void> {
  const lockfileExplorerProjectRoot: string = PackageJsonLookup.instance.tryGetPackageFolderFor(__dirname)!;
  const appVersion: string = JsonFile.load(`${lockfileExplorerProjectRoot}/package.json`).version;

  const appState: IAppState = init({ lockfileExplorerProjectRoot, appVersion, debugMode: true });

  const pnpmLockfileText: string = await FileSystem.readFileAsync(appState.pnpmLockfileLocation);
  const doc = yaml.load(pnpmLockfileText);

  const lockfileGraph = generateLockfileGraph(doc);
  const output = linter(lockfileGraph, false) as string;
  const rushJsonLocation: string | undefined = tryFindRushJsonLocation();
  if (!rushJsonLocation) {
    throw new Error(
      'This command must be run in a Rush workspace. ' +
        'A rush.json file was not found in this folder or any of its parent folders.'
    );
  }
  const workspaceRoot = path.dirname(rushJsonLocation);

  const lintingFile = `${workspaceRoot}/lockfileLint.json`;
  await FileSystem.writeFileAsync(lintingFile, output);

  console.log(colors.green(`Lockfile created at: ${lintingFile}`));
}

const debugMode: boolean = process.argv.indexOf('--debug') >= 0;

lintLockfile().catch((error) => {
  if (!(error instanceof AlreadyReportedError)) {
    console.error();
    if (debugMode) {
      console.error(colors.red('ERROR: ' + (error.stack ?? error.message)));
    } else {
      console.error(colors.red('ERROR: ' + error.message));
    }
  }
});
