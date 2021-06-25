// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ISetWebpackPublicPathOptions } from './SetPublicPathPlugin';

/**
 * @public
 */
export const registryVariableName: string = 'window.__setWebpackPublicPathLoaderSrcRegistry__';

export interface IInternalOptions extends ISetWebpackPublicPathOptions {
  webpackPublicPathVariable?: string;
  regexName?: string;
  linePrefix?: string;
}

const varName: string = 'publicPath';

function joinLines(lines: string[], linePrefix?: string): string {
  return lines
    .map((line: string) => {
      if (line) {
        return `${linePrefix || ''}${line}`;
      } else {
        return line;
      }
    })
    .join('\n')
    .replace(/\n\n+/g, '\n\n');
}

function escapeSingleQuotes(str: string): string | undefined {
  if (str) {
    return str.replace("'", "\\'");
  } else {
    return undefined;
  }
}

function appendSlashAndEscapeSingleQuotes(str: string): string | undefined {
  if (str && str.substr(-1) !== '/') {
    str = str + '/';
  }

  return escapeSingleQuotes(str);
}

export function getSetPublicPathCode(
  options: IInternalOptions,
  emitWarning: (warning: string) => void
): string {
  if (!options.webpackPublicPathVariable) {
    throw new Error('"webpackPublicPathVariable" option must be defined.');
  }

  let lines: string[] = [];
  if (options.regexName) {
    lines = [`var scripts = document.getElementsByTagName('script');`];

    const regexInitializationSnippet: string = `/${options.regexName}/i`;
    const regexVarName: string | undefined = options.regexVariable;
    if (options.regexVariable) {
      lines.push(
        ...[
          `var regex = (typeof ${regexVarName} !== 'undefined') ? ${regexVarName} : ${regexInitializationSnippet};`
        ]
      );
    } else {
      lines.push(...[`var regex = ${regexInitializationSnippet};`]);
    }

    lines.push(
      ...[
        `var ${varName};`,
        '',
        'if (scripts && scripts.length) {',
        '  for (var i = 0; i < scripts.length; i++) {',
        '    if (!scripts[i]) continue;',
        `    var path = scripts[i].getAttribute('src');`,
        '    if (path && path.match(regex)) {',
        `      ${varName} = path.substring(0, path.lastIndexOf('/') + 1);`,
        ...(options.preferLastFoundScript ? [] : ['      break;']),
        '    }',
        '  }',
        '}',
        '',
        `if (!${varName}) {`,
        `  for (var global in ${registryVariableName}) {`,
        '    if (global && global.match(regex)) {',
        `      ${varName} = global.substring(0, global.lastIndexOf('/') + 1);`,
        ...(options.preferLastFoundScript ? [] : ['      break;']),
        '    }',
        '  }',
        '}'
      ]
    );

    if (options.getPostProcessScript) {
      lines.push(...['', `if (${varName}) {`, `  ${options.getPostProcessScript(varName)};`, '}', '']);
    }
  } else {
    if (options.publicPath) {
      lines.push(...[`var ${varName} = '${appendSlashAndEscapeSingleQuotes(options.publicPath)}';`, '']);
    } else if (options.systemJs) {
      lines.push(
        ...[
          `var ${varName} = window.System ? window.System.baseURL || '' : '';`,
          `if (${varName} !== '' && ${varName}.substr(-1) !== '/') ${varName} += '/';`,
          ''
        ]
      );
    } else {
      emitWarning(`Neither 'publicPath' nor 'systemJs' is defined, so the public path will not be modified`);

      return '';
    }

    if (options.urlPrefix && options.urlPrefix !== '') {
      lines.push(...[`${varName} += '${appendSlashAndEscapeSingleQuotes(options.urlPrefix)}';`, '']);
    }

    if (options.getPostProcessScript) {
      lines.push(...[`if (${varName}) {`, `  ${options.getPostProcessScript(varName)};`, '}', '']);
    }
  }

  lines.push(`${options.webpackPublicPathVariable} = ${varName};`);

  return joinLines(lines, options.linePrefix);
}

/**
 * /**
 * This function returns a block of JavaScript that maintains a global register of script tags.
 *
 * @param debug - If true, the code returned code is not minified. Defaults to false.
 *
 * @public
 */
export function getGlobalRegisterCode(debug: boolean = false): string {
  // Minified version of this code:
  // (function(){
  // if (!window.__setWebpackPublicPathLoaderSrcRegistry__) window.__setWebpackPublicPathLoaderSrcRegistry__={};
  // var scripts = document.getElementsByTagName('script');
  // if (scripts && scripts.length) {
  //   for (var i = 0; i < scripts.length; i++) {
  //     if (!scripts[i]) continue;
  //     var path = scripts[i].getAttribute('src');
  //     if (path) window.__setWebpackPublicPathLoaderSrcRegistry__[path]=true;
  //   }
  // }
  // })()

  return `\n!function(){${registryVariableName}||(${registryVariableName}={});var e=document.getElementsByTagName("script");if(e&&e.length)for(var t=0;t<e.length;t++)if(e[t]){var r=e[t].getAttribute("src");r&&(${registryVariableName}[r]=!0)}}();`;
}
