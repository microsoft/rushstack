import { IPackageJson } from '../types/IPackageJson';

export interface ISpecChange {
  type: 'add' | 'remove' | 'diff';
  packageName: string;
  from?: string;
  to?: string;
}

export const compareSpec = (
  packageJson: IPackageJson,
  packageSpec: IPackageJson
): Map<string, ISpecChange> => {
  // packageName -> packageVersion (For all dependencies in a package.json file)
  const packageJsonMap: Map<string, string> = new Map();
  // packageName -> packageVersion (For all dependencies in a parsed package.json file)
  const packageSpecMap: Map<string, string> = new Map();
  for (const [entry, version] of Object.entries({
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
    ...packageJson.peerDependencies
  })) {
    packageJsonMap.set(entry, version);
  }
  for (const [entry, version] of Object.entries({
    ...packageSpec.dependencies,
    ...packageSpec.devDependencies,
    ...packageSpec.peerDependencies
  })) {
    packageSpecMap.set(entry, version);
  }
  const differentDependencies: Map<string, ISpecChange> = new Map();

  for (const dependency of packageJsonMap.keys()) {
    if (!packageSpecMap.has(dependency)) {
      differentDependencies.set(dependency, {
        type: 'remove',
        packageName: dependency
      });
    } else if (packageSpecMap.get(dependency) !== packageJsonMap.get(dependency)) {
      differentDependencies.set(dependency, {
        type: 'diff',
        packageName: dependency,
        from: packageJsonMap.get(dependency),
        to: packageSpecMap.get(dependency)
      });
    }
  }

  for (const dependency of packageSpecMap.keys()) {
    if (!packageJsonMap.has(dependency)) {
      differentDependencies.set(dependency, {
        type: 'add',
        packageName: dependency
      });
    }
  }
  return differentDependencies;
};
