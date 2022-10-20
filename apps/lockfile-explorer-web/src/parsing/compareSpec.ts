import { IPackageJson } from '../types/IPackageJson';

export const compareSpec = (packageJson: IPackageJson, packageSpec: IPackageJson): string[] => {
  const pkgJsonMap = new Map();
  const pkgSpecMap = new Map();
  for (const [entry, version] of Object.entries(packageJson.dependencies)) {
    pkgJsonMap.set(entry, version);
  }
  for (const [entry, version] of Object.entries(packageJson.dependencies)) {
    pkgSpecMap.set(entry, version);
  }
  return [];
};
