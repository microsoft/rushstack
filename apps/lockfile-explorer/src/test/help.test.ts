// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { execSync } from 'node:child_process';

describe('CLI Tool Tests', () => {
  it('should display help for "lockfile-explorer --help"', () => {
    const startOutput = execSync('node lib/start-explorer.js --help').toString();
    expect(startOutput).toMatchSnapshot();
  });

  it('should display help for "lockfile-lint --help"', () => {
    const lintOutput = execSync('node lib/start-lint.js --help').toString();
    expect(lintOutput).toMatchSnapshot();
  });

  it('should display help for "lockfile-lint init --help"', () => {
    const lintOutput = execSync('node lib/start-lint.js init --help').toString();
    expect(lintOutput).toMatchSnapshot();
  });

  it('should display help for "lockfile-lint check --help"', () => {
    const lintOutput = execSync('node lib/start-lint.js check --help').toString();
    expect(lintOutput).toMatchSnapshot();
  });
});
