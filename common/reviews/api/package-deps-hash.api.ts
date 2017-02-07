// (undocumented)
export function getPackageDeps(packagePath: string = process.cwd(), excludedPaths?: string[]): IPackageDeps;

// (undocumented)
interface IPackageDeps {
  // (undocumented)
  files: {
    [ key: string ]: string
  }
}

// (No packageDescription for this package)
