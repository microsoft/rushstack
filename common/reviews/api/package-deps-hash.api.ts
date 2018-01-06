// @public
export function getPackageDeps(packagePath?: string, excludedPaths?: string[]): IPackageDeps;

// @public (undocumented)
interface IPackageDeps {
  // (undocumented)
  files: {
    [key: string]: string;
  }
}

// (No @packagedocumentation comment for this package)
