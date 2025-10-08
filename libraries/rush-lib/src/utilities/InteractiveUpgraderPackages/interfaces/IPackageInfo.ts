// See npm-check-license for license information.

export type IVersionBumpType =
  | ''
  | 'build'
  | 'major'
  | 'premajor'
  | 'minor'
  | 'preminor'
  | 'patch'
  | 'prepatch'
  | 'prerelease'
  | 'nonSemver'
  | undefined
  // semver.diff can return null
  // eslint-disable-next-line @rushstack/no-new-null
  | null;

export interface IPackageInfo {
  moduleName: string; // name of the module.
  homepage: string; // url to the home page.
  regError?: Error; // error communicating with the registry
  pkgError?: Error; // error reading the package.json
  latest: string; // latest according to the registry.
  installed: string; // version installed
  notInstalled: boolean; // Is it installed?
  packageJson: string; // Version or range requested in the parent package.json.
  devDependency: boolean; // Is this a devDependency?
  mismatch: boolean; // Does the version installed not match the range in package.json?
  bump?: IVersionBumpType; // What kind of bump is required to get the latest
}
