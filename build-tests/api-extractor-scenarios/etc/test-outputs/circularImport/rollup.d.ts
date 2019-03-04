
/** @public */
export declare class IFile {
    containingFolder: IFolder;
}

/** @public */
export declare class IFolder {
    containingFolder: IFolder | undefined;
    files: IFile[];
}

export { }
