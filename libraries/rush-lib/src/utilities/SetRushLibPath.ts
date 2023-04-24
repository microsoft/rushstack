import { PackageJsonLookup } from '@rushstack/node-core-library';

import { EnvironmentVariableNames } from '../api/EnvironmentConfiguration';

const rootDir: string | undefined = PackageJsonLookup.instance.tryGetPackageFolderFor(__dirname);
if (rootDir) {
  // Route to the 'main' field of package.json
  const rushLibIndex: string = require.resolve(rootDir, { paths: [] });
  process.env[EnvironmentVariableNames.RUSH_LIB_PATH] = rushLibIndex;
}
