// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { execSync } from 'child_process';

describe('CLI Tool Tests', () => {
  it('should display help information with --help', () => {
    const startOutput = execSync('node lib/start.js --help').toString();
    const lintOutput = execSync('node lib/lint.js --help').toString();
    expect(startOutput).toMatchSnapshot();
    expect(lintOutput).toMatchSnapshot();
  });
});
