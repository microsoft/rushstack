import { IPackageJson } from '../types/IPackageJson';

export interface ISpecChange {
  type: string;
  pkg: string;
  from?: string;
  to?: string;
}

export const compareSpec = (
  packageJson: IPackageJson,
  packageSpec: IPackageJson
): Map<string, ISpecChange> => {
  const pkgJsonMap = new Map();
  const pkgSpecMap = new Map();
  for (const [entry, version] of Object.entries({
    ...packageJson.dependencies,
    ...packageJson.devDependencies
  })) {
    pkgJsonMap.set(entry, version);
  }
  for (const [entry, version] of Object.entries({
    ...packageSpec.dependencies,
    ...packageSpec.devDependencies
  })) {
    pkgSpecMap.set(entry, version);
  }
  const diffDeps: Map<string, ISpecChange> = new Map();

  for (const dep of pkgJsonMap.keys()) {
    if (!pkgSpecMap.has(dep)) {
      diffDeps.set(dep, {
        type: 'DELETED_DEP',
        pkg: dep
      });
    } else if (pkgSpecMap.get(dep) !== pkgJsonMap.get(dep)) {
      diffDeps.set(dep, {
        type: 'DIFF_DEP',
        pkg: dep,
        from: pkgJsonMap.get(dep),
        to: pkgSpecMap.get(dep)
      });
    }
  }

  for (const dep of pkgSpecMap.keys()) {
    if (!pkgJsonMap.has(dep)) {
      diffDeps.set(dep, {
        type: 'ADDED_DEP',
        pkg: dep
      });
    }
  }
  return diffDeps;
};
