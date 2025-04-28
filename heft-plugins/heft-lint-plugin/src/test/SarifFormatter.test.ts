// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.
import { formatEslintResultsAsSARIF } from '../SarifFormatter';
import type { ISerifFormatterOptions } from '../SarifFormatter';
import type { ESLint } from 'eslint';

describe('formatEslintResultsAsSARIF', () => {
  test('should correctly format ESLint results into SARIF log', () => {
    const mockLintResults: ESLint.LintResult[] = [
      {
        filePath: '/src/file1.ts',
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

    const mockRulesMeta: ESLint.LintResultData['rulesMeta'] = {
      'no-unused-vars': {
        type: 'suggestion',
        docs: {
          description: "'x' is defined but never used.",
          recommended: false,
          url: 'https://eslint.org/docs/latest/rules/no-unused-vars'
        },
        schema: [
          {
            type: 'object',
            properties: {
              allow: {
                type: 'array',
                items: {
                  type: 'string'
                },
                minItems: 1,
                uniqueItems: true
              }
            },
            additionalProperties: false
          }
        ],
        hasSuggestions: true,
        messages: {
          unexpected: "'x' is defined but never used."
        }
      }
    };

    const options: ISerifFormatterOptions = {
      ignoreSuppressed: false,
      eslintVersion: '7.32.0',
      buildFolderPath: '/'
    };

    const sarifLog = formatEslintResultsAsSARIF(mockLintResults, mockRulesMeta, options);

    expect(sarifLog).toMatchSnapshot();
  });

  test('case with no files', () => {
    const mockLintResults: ESLint.LintResult[] = [];

    const mockRulesMeta: ESLint.LintResultData['rulesMeta'] = {};

    const options: ISerifFormatterOptions = {
      ignoreSuppressed: false,
      eslintVersion: '7.32.0',
      buildFolderPath: '/'
    };

    const sarifLog = formatEslintResultsAsSARIF(mockLintResults, mockRulesMeta, options);

    expect(sarifLog).toMatchSnapshot();
  });

  test('case with single issues in the same file', () => {
    const mockLintResults: ESLint.LintResult[] = [
      {
        filePath: '/src/file1.ts',
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

    const mockRulesMeta: ESLint.LintResultData['rulesMeta'] = {
      'no-unused-vars': {
        type: 'suggestion',
        docs: {
          description: "'x' is defined but never used.",
          recommended: false,
          url: 'https://eslint.org/docs/latest/rules/no-unused-vars'
        },
        schema: [
          {
            type: 'object',
            properties: {
              allow: {
                type: 'array',
                items: {
                  type: 'string'
                },
                minItems: 1,
                uniqueItems: true
              }
            },
            additionalProperties: false
          }
        ],
        hasSuggestions: true,
        messages: {
          unexpected: "'x' is defined but never used."
        }
      }
    };

    const options: ISerifFormatterOptions = {
      ignoreSuppressed: false,
      eslintVersion: '7.32.0',
      buildFolderPath: '/'
    };

    const sarifLog = formatEslintResultsAsSARIF(mockLintResults, mockRulesMeta, options);

    expect(sarifLog).toMatchSnapshot();
  });

  test('should handle multiple issues in the same file', async () => {
    const mockLintResults: ESLint.LintResult[] = [
      {
        filePath: '/src/file2.ts',
        messages: [
          {
            ruleId: 'no-unused-vars',
            severity: 2,
            message: "'x' is defined but never used.",
            line: 5,
            column: 10,
            nodeType: 'Identifier',
            endLine: 5,
            endColumn: 11,
            source: 'let x;'
          },
          {
            ruleId: 'no-console',
            severity: 1,
            message: 'Unexpected console statement.',
            line: 10,
            column: 5,
            nodeType: 'MemberExpression',
            endLine: 10,
            endColumn: 16,
            source: 'console.log("test");'
          }
        ],
        suppressedMessages: [],
        errorCount: 1,
        warningCount: 1,
        fixableErrorCount: 0,
        fixableWarningCount: 0,
        usedDeprecatedRules: [],
        fatalErrorCount: 0
      }
    ];

    const mockRulesMeta: ESLint.LintResultData['rulesMeta'] = {
      'no-console': {
        type: 'suggestion',
        docs: {
          description: 'Disallow the use of `console`',
          recommended: false,
          url: 'https://eslint.org/docs/latest/rules/no-console'
        },
        schema: [
          {
            type: 'object',
            properties: {
              allow: {
                type: 'array',
                items: {
                  type: 'string'
                },
                minItems: 1,
                uniqueItems: true
              }
            },
            additionalProperties: false
          }
        ],
        hasSuggestions: true,
        messages: {
          unexpected: 'Unexpected console statement.',
          removeConsole: 'Remove the console.{{ propertyName }}().'
        }
      },
      'no-unused-vars': {
        type: 'suggestion',
        docs: {
          description: "'x' is defined but never used.",
          recommended: false,
          url: 'https://eslint.org/docs/latest/rules/no-unused-vars'
        },
        schema: [
          {
            type: 'object',
            properties: {
              allow: {
                type: 'array',
                items: {
                  type: 'string'
                },
                minItems: 1,
                uniqueItems: true
              }
            },
            additionalProperties: false
          }
        ],
        hasSuggestions: true,
        messages: {
          unexpected: "'x' is defined but never used."
        }
      }
    };

    const options: ISerifFormatterOptions = {
      ignoreSuppressed: false,
      eslintVersion: '7.32.0',
      buildFolderPath: '/'
    };

    const sarifLog = await formatEslintResultsAsSARIF(mockLintResults, mockRulesMeta, options);

    expect(sarifLog).toMatchSnapshot();
  });

  test('should handle a file with no messages', async () => {
    const mockLintResults: ESLint.LintResult[] = [
      {
        filePath: '/src/file3.ts',
        messages: [],
        suppressedMessages: [],
        errorCount: 0,
        warningCount: 0,
        fixableErrorCount: 0,
        fixableWarningCount: 0,
        usedDeprecatedRules: [],
        fatalErrorCount: 0
      }
    ];

    const mockRulesMeta: ESLint.LintResultData['rulesMeta'] = {};

    const options: ISerifFormatterOptions = {
      ignoreSuppressed: false,
      eslintVersion: '7.32.0',
      buildFolderPath: '/'
    };

    const sarifLog = await formatEslintResultsAsSARIF(mockLintResults, mockRulesMeta, options);

    expect(sarifLog).toMatchSnapshot();
  });

  test('should handle multiple files', async () => {
    const mockLintResults: ESLint.LintResult[] = [
      {
        filePath: '/src/file1.ts',
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
      },
      {
        filePath: '/src/file2.ts',
        messages: [
          {
            ruleId: 'eqeqeq',
            severity: 2,
            message: "Expected '===' and instead saw '=='.",
            line: 15,
            column: 8,
            nodeType: 'BinaryExpression',
            endLine: 15,
            endColumn: 10,
            source: 'if (a == b) { }'
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

    const mockRulesMeta: ESLint.LintResultData['rulesMeta'] = {
      'no-console': {
        type: 'suggestion',
        docs: {
          description: 'Disallow the use of `console`',
          recommended: false,
          url: 'https://eslint.org/docs/latest/rules/no-console'
        },
        schema: [
          {
            type: 'object',
            properties: {
              allow: {
                type: 'array',
                items: {
                  type: 'string'
                },
                minItems: 1,
                uniqueItems: true
              }
            },
            additionalProperties: false
          }
        ],
        hasSuggestions: true,
        messages: {
          unexpected: 'Unexpected console statement.',
          removeConsole: 'Remove the console.{{ propertyName }}().'
        }
      },
      eqeqeq: {
        type: 'problem',
        docs: {
          description: 'Require the use of === and !==',
          recommended: false,
          url: 'https://eslint.org/docs/latest/rules/eqeqeq'
        },
        schema: [
          {
            type: 'object',
            properties: {
              allow: {
                type: 'array',
                items: {
                  type: 'string'
                },
                minItems: 1,
                uniqueItems: true
              }
            },
            additionalProperties: false
          }
        ],
        hasSuggestions: true,
        messages: {
          unexpected: "Expected '===' and instead saw '=='."
        }
      }
    };

    const options: ISerifFormatterOptions = {
      ignoreSuppressed: false,
      eslintVersion: '7.32.0',
      buildFolderPath: '/'
    };

    const sarifLog = await formatEslintResultsAsSARIF(mockLintResults, mockRulesMeta, options);

    expect(sarifLog).toMatchSnapshot();
  });

  test('should handle ignoreSuppressed: true with suppressed messages', async () => {
    const mockLintResults: ESLint.LintResult[] = [
      {
        filePath: '/src/file4.ts',
        messages: [
          {
            ruleId: 'no-debugger',
            severity: 2,
            message: "Unexpected 'debugger' statement.",
            line: 20,
            column: 1,
            nodeType: 'DebuggerStatement',
            endLine: 20,
            endColumn: 9,
            source: 'debugger;'
          }
        ],
        suppressedMessages: [
          {
            ruleId: 'no-console',
            severity: 1,
            message: 'Unexpected console statement.',
            line: 10,
            column: 5,
            nodeType: 'MemberExpression',
            endLine: 10,
            endColumn: 16,
            source: 'console.log("test");',
            suppressions: [
              {
                kind: 'inSource',
                justification: 'rejected'
              }
            ]
          }
        ],
        errorCount: 1,
        warningCount: 0,
        fixableErrorCount: 0,
        fixableWarningCount: 0,
        usedDeprecatedRules: [],
        fatalErrorCount: 0
      }
    ];

    const mockRulesMeta: ESLint.LintResultData['rulesMeta'] = {
      'no-console': {
        type: 'suggestion',
        docs: {
          description: 'Disallow the use of `console`',
          recommended: false,
          url: 'https://eslint.org/docs/latest/rules/no-console'
        },
        schema: [
          {
            type: 'object',
            properties: {
              allow: {
                type: 'array',
                items: {
                  type: 'string'
                },
                minItems: 1,
                uniqueItems: true
              }
            },
            additionalProperties: false
          }
        ],
        hasSuggestions: true,
        messages: {
          unexpected: 'Unexpected console statement.',
          removeConsole: 'Remove the console.{{ propertyName }}().'
        }
      },
      'no-debugger': {
        type: 'suggestion',
        docs: {
          description: 'Disallow the use of debugger',
          recommended: false,
          url: 'https://eslint.org/docs/latest/rules/no-debugger'
        },
        schema: [
          {
            type: 'object',
            properties: {
              allow: {
                type: 'array',
                items: {
                  type: 'string'
                },
                minItems: 1,
                uniqueItems: true
              }
            },
            additionalProperties: false
          }
        ],
        hasSuggestions: true,
        messages: {
          unexpected: "Unexpected 'debugger' statement."
        }
      }
    };

    const options: ISerifFormatterOptions = {
      ignoreSuppressed: true,
      eslintVersion: '7.32.0',
      buildFolderPath: '/'
    };

    const sarifLog = await formatEslintResultsAsSARIF(mockLintResults, mockRulesMeta, options);

    expect(sarifLog).toMatchSnapshot();
  });

  test('should handle ignoreSuppressed: false with suppressed messages', async () => {
    const mockLintResults: ESLint.LintResult[] = [
      {
        filePath: '/src/file4.ts',
        messages: [
          {
            ruleId: 'no-debugger',
            severity: 2,
            message: "Unexpected 'debugger' statement.",
            line: 20,
            column: 1,
            nodeType: 'DebuggerStatement',
            endLine: 20,
            endColumn: 9,
            source: 'debugger;'
          }
        ],
        suppressedMessages: [
          {
            ruleId: 'no-console',
            severity: 1,
            message: 'Unexpected console statement.',
            line: 10,
            column: 5,
            nodeType: 'MemberExpression',
            endLine: 10,
            endColumn: 16,
            source: 'console.log("test");',
            suppressions: [
              {
                kind: 'inSource',
                justification: 'rejected'
              }
            ]
          }
        ],
        errorCount: 1,
        warningCount: 0,
        fixableErrorCount: 0,
        fixableWarningCount: 0,
        usedDeprecatedRules: [],
        fatalErrorCount: 0
      }
    ];

    const mockRulesMeta: ESLint.LintResultData['rulesMeta'] = {
      'no-console': {
        type: 'suggestion',
        docs: {
          description: 'Disallow the use of `console`',
          recommended: false,
          url: 'https://eslint.org/docs/latest/rules/no-console'
        },
        schema: [
          {
            type: 'object',
            properties: {
              allow: {
                type: 'array',
                items: {
                  type: 'string'
                },
                minItems: 1,
                uniqueItems: true
              }
            },
            additionalProperties: false
          }
        ],
        hasSuggestions: true,
        messages: {
          unexpected: 'Unexpected console statement.',
          removeConsole: 'Remove the console.{{ propertyName }}().'
        }
      },
      'no-debugger': {
        type: 'suggestion',
        docs: {
          description: 'Disallow the use of debugger',
          recommended: false,
          url: 'https://eslint.org/docs/latest/rules/no-debugger'
        },
        schema: [
          {
            type: 'object',
            properties: {
              allow: {
                type: 'array',
                items: {
                  type: 'string'
                },
                minItems: 1,
                uniqueItems: true
              }
            },
            additionalProperties: false
          }
        ],
        hasSuggestions: true,
        messages: {
          unexpected: "Unexpected 'debugger' statement."
        }
      }
    };

    const options: ISerifFormatterOptions = {
      ignoreSuppressed: false,
      eslintVersion: '7.32.0',
      buildFolderPath: '/'
    };

    const sarifLog = await formatEslintResultsAsSARIF(mockLintResults, mockRulesMeta, options);

    expect(sarifLog).toMatchSnapshot();
  });
});
