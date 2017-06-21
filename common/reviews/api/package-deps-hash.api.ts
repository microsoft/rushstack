// @public
export function getPackageDeps(packagePath: string = process.cwd(), excludedPaths?: string[]): IPackageDeps;

// @public (undocumented)
interface IPackageDeps {
  // (undocumented)
  files: {
    [ key: string ]: string
  }
}

// (No packageDescription for this package)
