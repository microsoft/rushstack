// @public (undocumented)
declare class IFile {
    // (undocumented)
    containingFolder: IFolder;
}

// @public (undocumented)
declare class IFolder {
    // (undocumented)
    containingFolder: IFolder | undefined;
    // (undocumented)
    files: IFile[];
}


// (No @packageDocumentation comment for this package)
