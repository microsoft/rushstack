import type { INpmCheckPackageSummary } from './INpmCheckPackageSummary';

export interface INpmCheckPackageJson {
  name?: string;
  version?: string;
  devDependencies: Record<string, string>;
  dependencies: Record<string, string>;
  error?: Error;
  scripts?: Record<string, string>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export interface INpmCheckState {
  cwd: string;
  /**
   * The package.json contents of the project to check. If this is not provided, it is read from
   * the package.json file in `cwd`.
   *
   * @remarks
   * Provide this to check dependency version specifiers that differ from the package.json file, for example
   * after resolving references such as PNPM's `catalog:` protocol to the versions that they refer to.
   */
  cwdPackageJson?: INpmCheckPackageJson;
  packages?: INpmCheckPackageSummary[];
}

export const DefaultNpmCheckOptions: INpmCheckState = {
  cwd: process.cwd(),
  cwdPackageJson: { devDependencies: {}, dependencies: {} },
  packages: undefined
};
