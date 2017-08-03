// @public
export function getGlobalRegisterCode(debug: boolean = false): string;

// @public
interface ISetWebpackPublicPathOptions {
  getPostProcessScript?: (varName: string) => string;
  publicPath?: string;
  regexVariable?: string;
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
class SetPublicPathPlugin implements Plugin {
  constructor(options: ISetWebpackPublicPathPluginOptions);
  // (undocumented)
  public apply(compiler: Webpack & ITapable): void;
  // (undocumented)
  public options: ISetWebpackPublicPathPluginOptions;
}

// WARNING: Unsupported export: registryVariableName
