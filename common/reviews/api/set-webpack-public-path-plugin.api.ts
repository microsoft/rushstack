// @public
declare function getGlobalRegisterCode(debug?: boolean): string;

// @public
interface ISetWebpackPublicPathOptions {
    getPostProcessScript?: (varName: string) => string;
    preferLastFoundScript?: boolean;
    publicPath?: string;
    regexVariable?: string;
    skipDetection?: boolean;
    systemJs?: boolean;
    urlPrefix?: string;
}

// @public
interface ISetWebpackPublicPathPluginOptions extends ISetWebpackPublicPathOptions {
    scriptName?: {
        name: string;
        isTokenized: boolean;
    };
}

// @public (undocumented)
declare const registryVariableName: string;

// @public
declare class SetPublicPathPlugin implements Webpack.Plugin {
    // (undocumented)
    constructor(options: ISetWebpackPublicPathPluginOptions);
    // (undocumented)
    apply(compiler: Webpack.Compiler): void;
    // (undocumented)
    options: ISetWebpackPublicPathPluginOptions;
}

