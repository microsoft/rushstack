/*
 * Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
 * See LICENSE in the project root for license information.
 */

import { EOL } from 'os';
import * as uglify from 'uglify-js';

/* tslint:disable:typedef */
const loaderUtils = require('loader-utils');
/* tslint:enable:typedef */

export interface ISetWebpackPublicPathLoaderOptions {
  systemJs?: boolean;
  scriptPath?: string;
  urlPrefix?: string;
  publicPath?: string;
}

export class SetWebpackPublicPathLoader {
  public static registryVarName: string = 'window.__setWebpackPublicPathLoaderSrcRegistry__';

  public static getGlobalRegisterCode(debug: boolean = false): string {
    const lines: string[] = [
      '(function(){',
      `if (!${SetWebpackPublicPathLoader.registryVarName}) ${SetWebpackPublicPathLoader.registryVarName}={};`,
      `var scripts = document.getElementsByTagName('script');`,
      'if (scripts && scripts.length) {',
      '  for (var i = 0; i < scripts.length; i++) {',
      '    if (!scripts[i]) continue;',
      `    var path = scripts[i].getAttribute('src');`,
      `    if (path) ${SetWebpackPublicPathLoader.registryVarName}[path]=true;`,
      '  }',
      '}',
      '})();'
    ];

    const joinedScript: string = SetWebpackPublicPathLoader.joinLines(lines);

    if (debug) {
      return `${EOL}${joinedScript}`;
    } else {
      const uglified: uglify.AST_Toplevel = uglify.parse(joinedScript);
      uglified.figure_out_scope();
      const compressor: uglify.AST_Toplevel = uglify.Compressor({
        dead_code: true
      });
      const compressed: uglify.AST_Toplevel = uglified.transform(compressor);
      compressed.figure_out_scope();
      compressed.compute_char_frequency();
      compressed.mangle_names();
      return `${EOL}${compressed.print_to_string()}`;
    }
  }

  public static pitch(remainingRequest: string): string {
    /* tslint:disable:no-any */
    const self: any = this;
    /* tslint:enable:no-any */

    const options: ISetWebpackPublicPathLoaderOptions =
      SetWebpackPublicPathLoader.getOptions(self.query);
    let lines: string[] = [];

    if (options.scriptPath) {
      lines = [
        `var scripts = document.getElementsByTagName('script');`,
        `var regex = new RegExp('${SetWebpackPublicPathLoader.escapeSingleQuotes(options.scriptPath)}', 'i');`,
        'var found = false;',
        '',
        'if (scripts && scripts.length) {',
        '  for (var i = 0; i < scripts.length; i++) {',
        '    if (!scripts[i]) continue;',
        `    var path = scripts[i].getAttribute('src');`,
        '    if (path && path.match(regex)) {',
        `      __webpack_public_path__ = path.substring(0, path.lastIndexOf('/') + 1);`,
        '      found = true;',
        '      break;',
        '    }',
        '  }',
        '}',
        '',
        'if (!found) {',
        `  for (var global in ${SetWebpackPublicPathLoader.registryVarName}) {`,
        '    if (global && global.match(regex)) {',
        `      __webpack_public_path__ = global.substring(0, global.lastIndexOf('/') + 1);`,
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

    return SetWebpackPublicPathLoader.joinLines(lines);
  }

  private static joinLines(lines: string[]): string {
    return lines.join(EOL).replace(new RegExp(`${EOL}${EOL}+`, 'g'), `${EOL}${EOL}`);
  }

  private static escapeSingleQuotes(str: string): string {
    if (str) {
      return str.replace('\'', '\\\'');
    } else {
      return undefined;
    }
  }

  private static appendSlashAndEscapeSingleQuotes(str: string): string {
    if (str && str.substr(-1) !== '/') {
      str = str + '/';
    }

    return SetWebpackPublicPathLoader.escapeSingleQuotes(str);
  }

  private static getOptions(query: string): ISetWebpackPublicPathLoaderOptions {
    const options: ISetWebpackPublicPathLoaderOptions = loaderUtils.parseQuery(query);
    if (options.systemJs || options.publicPath) {
      // If ?systemJs or ?publicPath=... is set inline, override scriptPath
      options.scriptPath = undefined;
    }

    return options;
  }

  constructor() {
    throw new Error('Constructing "LoadThemedStylesLoader" is not supported.');
  }
}
