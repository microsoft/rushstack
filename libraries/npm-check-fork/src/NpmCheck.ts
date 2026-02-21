import _ from 'lodash';

import type { INpmCheckPackageJson, INpmCheckState } from './interfaces/INpmCheck.ts';
import type { INpmCheckPackageSummary } from './interfaces/INpmCheckPackageSummary.ts';
import createPackageSummary from './CreatePackageSummary.ts';
import initializeState from './NpmCheckState.ts';

export default async function NpmCheck(initialOptions?: INpmCheckState): Promise<INpmCheckState> {
  const state: INpmCheckState = await initializeState(initialOptions);
  const cwdPackageJson: INpmCheckPackageJson | undefined = state.cwdPackageJson;
  const allDependencies: Record<string, string> | undefined = getDependencies(cwdPackageJson);

  let packages: INpmCheckPackageSummary[] = [];
  if (allDependencies) {
    const packageSummaryPromises: Promise<INpmCheckPackageSummary | false>[] = Object.keys(
      allDependencies
    ).map((moduleName: string) => createPackageSummary(moduleName, state));
    packages = await Promise.all(packageSummaryPromises).then(
      (results: (INpmCheckPackageSummary | false)[]) => {
        return results.filter((pkg): pkg is INpmCheckPackageSummary => pkg !== false);
      }
    );
  }

  return { ...state, packages };
}

function getDependencies(pkg: INpmCheckPackageJson | undefined): Record<string, string> | undefined {
  if (!pkg) {
    return undefined;
  }

  return _.extend(pkg.dependencies, pkg.devDependencies);
}
