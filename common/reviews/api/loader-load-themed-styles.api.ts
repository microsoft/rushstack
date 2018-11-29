// @public
interface ILoadThemedStylesLoaderOptions {
  async?: boolean;
  namedExport?: string;
}

// @public
class LoadThemedStylesLoader {
  constructor();
  static loadedThemedStylesPath: string;
  // (undocumented)
  static pitch(this: loader.LoaderContext, remainingRequest: string): string;
  static resetLoadedThemedStylesPath(): void;
}

