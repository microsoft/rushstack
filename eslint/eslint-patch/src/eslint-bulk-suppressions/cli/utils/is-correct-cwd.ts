// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import fs from 'node:fs';

export function isCorrectCwd(cwd: string): boolean {
  return (
    fs.existsSync(`${cwd}/eslint.config.js`) ||
    fs.existsSync(`${cwd}/eslint.config.cjs`) ||
    fs.existsSync(`${cwd}/eslint.config.mjs`) ||
    fs.existsSync(`${cwd}/.eslintrc.js`) ||
    fs.existsSync(`${cwd}/.eslintrc.cjs`)
  );
}
