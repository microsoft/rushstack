// @public
interface ILoadThemedStylesLoaderOptions {
  async?: boolean;
  namedExport?: string;
}

// WARNING: loadedThemedStylesPath has incomplete type information
// @public
class LoadThemedStylesLoader {
  constructor();
  // (undocumented)
  public static pitch(this: loader.LoaderContext, remainingRequest: string): string;
  public static resetLoadedThemedStylesPath(): void;
}

