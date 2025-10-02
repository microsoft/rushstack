// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { EOL } from 'node:os';

const loaderFn: (content: string) => string = (content: string) => {
  content = content.replace(/\\/g, '\\\\');
  content = content.replace(/'/g, "\\'");
  content = content.replace(/\n/g, '\\n');
  content = content.replace(/\r/g, '\\r');

  const lines: string[] = [
    '(function (global) {',
    `  eval('${content}');`,
    '}.call(exports, (function() { return this; }())))'
  ];

  return lines.join(EOL);
};

export = loaderFn;
