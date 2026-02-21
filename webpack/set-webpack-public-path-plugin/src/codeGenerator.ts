// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ISetWebpackPublicPathOptions } from './SetPublicPathPlugin.ts';

export interface IInternalOptions extends ISetWebpackPublicPathOptions {
  webpackPublicPathVariable: string;
  regexName: string;
  linePrefix?: string;
}

const VAR_NAME: string = 'publicPath';

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

export function getSetPublicPathCode({
  regexName,
  regexVariable,
  preferLastFoundScript,
  webpackPublicPathVariable,
  getPostProcessScript,
  linePrefix
}: IInternalOptions): string {
  let lines: string[] = [];
  lines = [`var scripts = document.getElementsByTagName('script');`];

  const regexInitializationSnippet: string = `/${regexName}/i`;
  const regexVarName: string | undefined = regexVariable;
  if (regexVariable) {
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
      `var ${VAR_NAME};`,
      '',
      'if (scripts && scripts.length) {',
      '  for (var i = 0; i < scripts.length; i++) {',
      '    if (!scripts[i]) continue;',
      `    var path = scripts[i].getAttribute('src');`,
      '    if (path && path.match(regex)) {',
      `      ${VAR_NAME} = path.substring(0, path.lastIndexOf('/') + 1);`,
      ...(preferLastFoundScript ? [] : ['      break;']),
      '    }',
      '  }',
      '}',
      ''
    ]
  );

  if (getPostProcessScript) {
    lines.push(...['', `if (${VAR_NAME}) {`, `  ${getPostProcessScript(VAR_NAME)};`, '}', '']);
  }

  lines.push(`${webpackPublicPathVariable} = ${VAR_NAME};`);

  return joinLines(lines, linePrefix);
}
