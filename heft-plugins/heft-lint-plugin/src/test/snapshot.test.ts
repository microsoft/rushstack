// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.
import { formatAsSARIF } from '../SarifFormatter';
import type { ISerifFormatterOptions } from '../SarifFormatter';
import type { ESLint } from 'eslint';

describe('formatAsSARIF', () => {
  test('should correctly format ESLint results into SARIF log', () => {
    const mockLintResults: ESLint.LintResult[] = [
      {
        filePath: 'src/file1.ts',
        messages: [
          {
            ruleId: 'no-unused-vars',
            severity: 2,
            message: "'x' is defined but never used.",
            line: 10,
            column: 5,
            nodeType: 'Identifier',
            endLine: 10,
            endColumn: 6,
            source: 'const x = 1;'
          }
        ],
        suppressedMessages: [],
        errorCount: 1,
        warningCount: 0,
        fixableErrorCount: 0,
        fixableWarningCount: 0,
        usedDeprecatedRules: [],
        fatalErrorCount: 0
      }
    ];

    const options: ISerifFormatterOptions = {
      ignoreSuppressed: false,
      eslintVersion: '7.32.0'
    };

    const sarifLog = formatAsSARIF(mockLintResults, options);

    expect(sarifLog).toMatchSnapshot();
  });
});
