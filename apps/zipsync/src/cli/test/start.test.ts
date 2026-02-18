// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'node:path';
import { execSync } from 'node:child_process';

describe('CLI Tool Tests', () => {
  it('should display help for "zipsync --help"', () => {
    const packageFolder: string = path.resolve(__dirname, '../../..');
    const startOutput = execSync('node lib-commonjs/start.js --help', {
      encoding: 'utf-8',
      cwd: packageFolder
    });
    const normalized = startOutput.replace(
      /zipsync \d+\.\d+\.\d+(?:-[0-9A-Za-z-.]+)? - https:\/\/rushstack\.io/,
      'zipsync {version} - https://rushstack.io'
    );
    expect(normalized).toMatchSnapshot();
  });
});
