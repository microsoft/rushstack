// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { execSync } from 'node:child_process';

describe('CLI Tool Tests', () => {
  it('should display help for "zipsync --help"', () => {
    const startOutput = execSync('node lib/start.js --help', { encoding: 'utf-8' });
    const normalized = startOutput.replace(
      /zipsync \d+\.\d+\.\d+(?:-[0-9A-Za-z-.]+)? - https:\/\/rushstack\.io/,
      'zipsync {version} - https://rushstack.io'
    );
    expect(normalized).toMatchSnapshot();
  });
});
