// @public
interface ILoadThemedStylesLoaderOptions {
    async?: boolean;
    namedExport?: string;
}

// @public
declare class LoadThemedStylesLoader {
    // (undocumented)
    constructor();
    static loadedThemedStylesPath: string;
    // (undocumented)
    private static _loadedThemedStylesPath;
    // (undocumented)
    static pitch(this: loader.LoaderContext, remainingRequest: string): string;
    static resetLoadedThemedStylesPath(): void;
}

