// (undocumented)
interface IWebpackTaskConfiguration {
  configuration?: Webpack.Configuration;
  configurationPath: string;
  suppressWarnings?: (string | RegExp)[];
  webpack?: typeof Webpack;
}

// (undocumented)
class WebpackTask extends GulpTask<IWebpackTaskConfiguration> {
  // (undocumented)
  public executeTask(gulp: gulp.Gulp, completeCallback: (result?: Object) => void): void;
  // (undocumented)
  public isEnabled(buildConfiguration: IBuildConfiguration): boolean;
  // (undocumented)
  public loadSchema(): Object;
  // (undocumented)
  public name: string;
  // (undocumented)
  public readonly resources: Object;
  // (undocumented)
  public taskConfiguration: IWebpackTaskConfiguration;
}

// WARNING: Unsupported export: webpack
// WARNING: Unsupported export: default
// (No packageDescription for this package)
