// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { execSync } from 'child_process';

describe('CLI Tool Tests', () => {
  it('should display help information with --help', () => {
    const output = execSync('node lib/start.js --help').toString();
    expect(output).toMatchSnapshot();
  });
});
