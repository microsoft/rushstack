// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import fs from 'fs';

export function isCorrectCwd(cwd: string): boolean {
  return fs.existsSync(`${cwd}/.eslintrc.js`) || fs.existsSync(`${cwd}/.eslintrc.cjs`);
}
