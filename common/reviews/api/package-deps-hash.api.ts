// @public
declare function getPackageDeps(packagePath?: string, excludedPaths?: string[]): IPackageDeps;

// @public (undocumented)
interface IPackageDeps {
    // (undocumented)
    files: {
        // (undocumented)
        [key: string]: string;
    };
}


// (No @packageDocumentation comment for this package)
