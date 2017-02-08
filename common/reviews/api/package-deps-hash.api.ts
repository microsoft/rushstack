export function getPackageDeps(packagePath: string = process.cwd(), excludedPaths?: string[]): IPackageDeps;

interface IPackageDeps {
  files: {
    [ key: string ]: string
  }
}

// (No packageDescription for this package)
