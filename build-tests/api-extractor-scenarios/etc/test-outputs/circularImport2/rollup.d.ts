
/** @public */
export declare class A {
}

/** @public */
export declare class B {
}

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
