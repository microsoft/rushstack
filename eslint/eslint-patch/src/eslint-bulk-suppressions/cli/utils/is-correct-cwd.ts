// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import fs from 'fs';
import path from 'path';

export function isCorrectCwd(cwd: string): boolean {
  return fs.existsSync(path.join(cwd, '.eslintrc.js')) || fs.existsSync(path.join(cwd, '.eslintrc.cjs'));
}
