import { merge } from 'lodash';
const loaderUtils = require('loader-utils');

export interface ISetWebpackPublicPathLoaderOptions {
  systemJs?: boolean;
  scriptPath?: string;
  urlPrefix?: string;
  publicPath?: string;
}

export class SetWebpackPublicPathLoader {
  private static defaultOptions: ISetWebpackPublicPathLoaderOptions = {
    systemJs: false,
    scriptPath: null,
    urlPrefix: null,
    publicPath: null
  };

  public static setOptions(options: ISetWebpackPublicPathLoaderOptions) {
    this.defaultOptions = options || {};
  }

  public static pitch(remainingRequest: string): string {
    const self: any = this;

    const options: ISetWebpackPublicPathLoaderOptions =
      SetWebpackPublicPathLoader.getOptions(self.query);
    let lines: string[] = [];

    if (options.scriptPath) {
      lines = [
        `var scripts = document.getElementsByTagName('script');`,
        '',
        'if (scripts && scripts.length) {',
        `  var regex = new RegExp('${SetWebpackPublicPathLoader.escapeSingleQuotes(options.scriptPath)}');`,
        '  for (var i = 0; i < scripts.length; i++) {',
        '    if (!scripts[i]) continue;',
        `    var path = scripts[i].getAttribute('src');`,
        '    if (path && path.match(regex)) {',
        `      __webpack_public_path__ = path.substring(0, path.lastIndexOf('/') + 1);`,
        '      break;',
        '    }',
        '  }',
        '}'
      ];
    } else {
      if (options.publicPath) {
        lines = [
          'var publicPath = ' +
            `'${SetWebpackPublicPathLoader.appendSlashAndEscapeSingleQuotes(options.publicPath)}';`
        ];
      } else if (options.systemJs) {
        lines = [
          `var publicPath = window.System ? window.System.baseURL || '' : '';`,
          `if (publicPath !== '' && publicPath.substr(-1) !== '/') publicPath += '/';`
        ];
      } else {
        self.emitWarning(`Neither 'publicPath' nor 'systemJs' is defined,` +
          'so the public path will not be modified');

        return '';
      }

      if (options.urlPrefix && options.urlPrefix !== '') {
        lines.push(
          '',
          'publicPath += ' +
            `'${SetWebpackPublicPathLoader.appendSlashAndEscapeSingleQuotes(options.urlPrefix)}';`);
      }

      lines.push(
        '',
        `__webpack_public_path__ = publicPath;`
      );
    }

    return lines.join('\n').replace(/\n\n+/, '\n\n');
  }

  private static escapeSingleQuotes(str: string): string {
    if (str) {
      return str.replace('\'', '\\\'');
    } else {
      return null;
    }
  }

  private static appendSlashAndEscapeSingleQuotes(str: string): string {
    if (str && str.substr(-1) !== '/') {
      str = str + '/';
    }

    return SetWebpackPublicPathLoader.escapeSingleQuotes(str);
  }

  private static getOptions(query: string): ISetWebpackPublicPathLoaderOptions {
    const options: ISetWebpackPublicPathLoaderOptions = {
      systemJs: SetWebpackPublicPathLoader.defaultOptions.systemJs,
      scriptPath: SetWebpackPublicPathLoader.defaultOptions.scriptPath,
      urlPrefix: SetWebpackPublicPathLoader.defaultOptions.urlPrefix,
      publicPath: SetWebpackPublicPathLoader.defaultOptions.publicPath
    };

    const queryOptions: ISetWebpackPublicPathLoaderOptions = loaderUtils.parseQuery(query);

    return merge(options, queryOptions);
  }
}
