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
declare const webpack: WebpackTask;

// @public (undocumented)
declare class WebpackTask<TExtendedConfig = {}> extends GulpTask<IWebpackTaskConfig & TExtendedConfig> {
    // (undocumented)
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


// (No @packageDocumentation comment for this package)
