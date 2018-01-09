// @public (undocumented)
interface IWebpackResources {
  // (undocumented)
  webpack: typeof Webpack;
}

// @public (undocumented)
interface IWebpackTaskConfig {
  config?: Webpack.Configuration;
  configPath: string;
  printStats?: boolean;
  suppressWarnings?: (string | RegExp)[];
  webpack?: typeof Webpack;
}

// @public (undocumented)
class WebpackTask<TExtendedConfig = {}> extends GulpTask<IWebpackTaskConfig & TExtendedConfig> {
  constructor(extendedName?: string, extendedConfig?: TExtendedConfig);
  // (undocumented)
  executeTask(gulp: typeof Gulp, completeCallback: (error?: string) => void): void;
  // (undocumented)
  isEnabled(buildConfig: IBuildConfig): boolean;
  // (undocumented)
  loadSchema(): Object;
  // (undocumented)
  readonly resources: IWebpackResources;
}

// WARNING: Unsupported export: webpack
// WARNING: Unsupported export: default
// (No @packagedocumentation comment for this package)
