// @public
export function getGlobalRegisterCode(debug?: boolean): string;

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
    isTokenized: boolean;
    name: string;
  }
}

// @public
class SetPublicPathPlugin implements Webpack.Plugin {
  constructor(options: ISetWebpackPublicPathPluginOptions);
  // (undocumented)
  apply(compiler: Webpack.Compiler): void;
  // (undocumented)
  options: ISetWebpackPublicPathPluginOptions;
}

// WARNING: Unsupported export: registryVariableName
