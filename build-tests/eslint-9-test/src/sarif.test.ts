// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

const sarifLogPath: string = path.resolve(__dirname, '../temp/build/lint/lint.sarif');

describe('Sarif Logs', () => {
  it('has the expected content', () => {
    const logContent = fs.readFileSync(sarifLogPath, 'utf-8');
    const parsedLog = JSON.parse(logContent);
    expect(parsedLog).toMatchSnapshot();
  });
});
