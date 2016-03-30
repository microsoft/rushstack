import { merge } from 'lodash';
const loaderUtils = require('loader-utils');

export interface ISetWebpackPublicPathLoaderOptions {
  systemJs?: boolean;
  scriptPath?: string;
  urlPrefix?: string;
}

export class SetWebpackPublicPathLoader {
  private static defaultOptions: ISetWebpackPublicPathLoaderOptions = {
    systemJs: false,
    scriptPath: null,
    urlPrefix: null
  };

  public static setOptions(options: ISetWebpackPublicPathLoaderOptions) {
    this.defaultOptions = options;
  }

  public static pitch(remainingRequest: string): string {
    const options: ISetWebpackPublicPathLoaderOptions =
      SetWebpackPublicPathLoader.getOptions((this as any).query);
    let lines: string[] = [];

    if (options.scriptPath) {
      lines = [
        `var scripts = document.getElementsByTagName('script');`,
        '',
        'if (scripts && scripts.length) {',
        `  var regex = new RegExp('${options.scriptPath.replace('\'', '\\\'')}')`,
        '  for (var i = 0; i < scripts.length; i++) {',
        '    var script = scripts[i];',
        '    if (!script) continue;',
        `    var path = script.getAttribute('src');`,
        '    if (path && path.match(regex)) {',
        `      __webpack_public_path__ = path.substring(0, path.lastIndexOf('/') + 1);`,
        '      break;',
        '    }',
        '  }',
        '}'
      ];
    } else {
      let urlPrefix = options.urlPrefix || '';
      if (urlPrefix !== '' && urlPrefix.substr(-1) !== '/') {
        urlPrefix += '/';
      }

      lines = [
        `var publicPath = ${(options.systemJs) ? `(System && System.baseURL) ? System.baseURL : ''` : ''};`,
        `if (publicPath !== '' && publicPath.substr(-1) !== '/') publicPath += '/';`,
        '',
        (urlPrefix !== '') ? `publicPath += '${urlPrefix}';` : '',
        '',
        `__webpack_public_path__ = publicPath;`
      ];
    }

    return lines.join('\n');
  }

  private static getOptions(query: string): ISetWebpackPublicPathLoaderOptions {
    const options: ISetWebpackPublicPathLoaderOptions = {
      systemJs: SetWebpackPublicPathLoader.defaultOptions.systemJs,
      scriptPath: SetWebpackPublicPathLoader.defaultOptions.scriptPath,
      urlPrefix: SetWebpackPublicPathLoader.defaultOptions.urlPrefix
    };

    const queryOptions: ISetWebpackPublicPathLoaderOptions = loaderUtils.parseQuery(query);

    return merge(options, queryOptions);
  }
}
