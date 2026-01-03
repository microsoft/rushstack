// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';
import type {
  IStringValuesTypingsGeneratorBaseOptions,
  IStringValueTypings
} from '../StringValuesTypingsGenerator';

let inputFs: Record<string, string>;
let outputFs: Record<string, string>;

jest.mock('@rushstack/node-core-library', () => {
  const realNcl: typeof import('@rushstack/node-core-library') = jest.requireActual(
    '@rushstack/node-core-library'
  );
  return {
    ...realNcl,
    FileSystem: {
      readFileAsync: async (filePath: string) => {
        const result: string | undefined = inputFs[filePath];
        if (result === undefined) {
          const error: NodeJS.ErrnoException = new Error(
            `Cannot read file ${filePath}`
          ) as NodeJS.ErrnoException;
          error.code = 'ENOENT';
          throw error;
        } else {
          return result;
        }
      },
      writeFileAsync: async (filePath: string, contents: string) => {
        outputFs[filePath] = contents;
      }
    }
  };
});

describe('StringValuesTypingsGenerator', () => {
  beforeEach(() => {
    inputFs = {};
    outputFs = {};
  });

  function runTests(
    baseOptions: IStringValuesTypingsGeneratorBaseOptions,
    extraStringTypings?: Partial<IStringValueTypings>
  ): void {
    it('should generate typings', async () => {
      const [{ StringValuesTypingsGenerator }, { Terminal, StringBufferTerminalProvider }] =
        await Promise.all([import('../StringValuesTypingsGenerator'), import('@rushstack/terminal')]);
      const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider();
      const terminal: Terminal = new Terminal(terminalProvider);

      inputFs['/src/test.ext'] = '';

      const fileContents: {} = { a: 1 };
      const generator = new StringValuesTypingsGenerator({
        srcFolder: '/src',
        generatedTsFolder: '/out',
        readFile: (filePath: string, relativePath: string) => {
          expect(relativePath).toEqual('test.ext');
          return Promise.resolve(fileContents);
        },
        fileExtensions: ['.ext'],
        parseAndGenerateTypings: (contents: {}, filePath: string, relativePath: string) => {
          expect(contents).toBe(fileContents);
          return {
            typings: [
              {
                exportName: 'test',
                comment: 'test comment\nsecond line'
              }
            ],
            ...extraStringTypings
          };
        },
        terminal,
        ...baseOptions
      });

      await generator.generateTypingsAsync(['test.ext']);
      expect(outputFs).toMatchSnapshot();

      expect(terminalProvider.getAllOutput(true)).toEqual({});
    });
  }

  describe('non-default exports', () => {
    runTests({});
  });

  describe('default exports', () => {
    describe('with { exportAsDefault: true }', () => {
      runTests({ exportAsDefault: true });
    });

    describe("with { exportAsDefault: true, exportAsDefaultInterfaceName: 'IOverride' }", () => {
      runTests({
        exportAsDefault: true,
        exportAsDefaultInterfaceName: 'IOverride'
      });
    });

    describe("with { exportAsDefault: {}, exportAsDefaultInterfaceName: 'IOverride' }", () => {
      runTests({
        exportAsDefault: {},
        exportAsDefaultInterfaceName: 'IOverride'
      });
    });

    describe("with { exportAsDefault: { interfaceName: 'IOverride' }, exportAsDefaultInterfaceName: 'IDeprecated' }", () => {
      runTests({
        exportAsDefault: {
          interfaceName: 'IOverride'
        },
        exportAsDefaultInterfaceName: 'IDeprecated'
      });
    });

    describe("with { exportAsDefault: documentationComment: 'deprecated', interfaceDocumentationComment: 'doc-comment' }", () => {
      runTests({
        exportAsDefault: {
          documentationComment: 'deprecated',
          interfaceDocumentationComment: 'doc-comment'
        }
      });
    });

    describe("with { exportAsDefault: { *DocumentationComment: 'doc-comment\\nsecond line' } }", () => {
      runTests({
        exportAsDefault: {
          interfaceDocumentationComment: 'doc-comment\nsecond line',
          valueDocumentationComment: 'value-comment\nsecond line'
        }
      });
    });

    describe('overrides for individual files', () => {
      describe('with exportAsDefault unset', () => {
        describe('overriding with { exportAsDefault: false }', () => {
          runTests(
            {},
            {
              exportAsDefault: false
            }
          );
        });

        describe("overriding with { interfaceName: 'IOverride' } ", () => {
          runTests(
            {},
            {
              exportAsDefault: {
                interfaceName: 'IOverride'
              }
            }
          );
        });

        describe('overriding with a new doc comment ', () => {
          runTests(
            {},
            {
              exportAsDefault: {
                interfaceDocumentationComment: 'doc-comment\nsecond line',
                valueDocumentationComment: 'value-comment\nsecond line'
              }
            }
          );
        });
      });

      describe('with exportAsDefault set to true', () => {
        describe('overriding with { exportAsDefault: false }', () => {
          runTests(
            {
              exportAsDefault: true
            },
            {
              exportAsDefault: false
            }
          );
        });

        describe("overriding with { interfaceName: 'IOverride' } ", () => {
          runTests(
            {
              exportAsDefault: true
            },
            {
              exportAsDefault: {
                interfaceName: 'IOverride'
              }
            }
          );
        });

        describe('overriding with a new doc comment ', () => {
          runTests(
            {
              exportAsDefault: true
            },
            {
              exportAsDefault: {
                interfaceDocumentationComment: 'doc-comment\nsecond line',
                valueDocumentationComment: 'value-comment\nsecond line'
              }
            }
          );
        });
      });

      describe('with exportAsDefault set to {}', () => {
        describe('overriding with { exportAsDefault: false }', () => {
          runTests(
            {
              exportAsDefault: {}
            },
            {
              exportAsDefault: false
            }
          );
        });

        describe("overriding with { interfaceName: 'IOverride' } ", () => {
          runTests(
            {
              exportAsDefault: {}
            },
            {
              exportAsDefault: {
                interfaceName: 'IOverride'
              }
            }
          );
        });

        describe('overriding with a new doc comment ', () => {
          runTests(
            {
              exportAsDefault: {}
            },
            {
              exportAsDefault: {
                interfaceDocumentationComment: 'doc-comment\nsecond line',
                valueDocumentationComment: 'value-comment\nsecond line'
              }
            }
          );
        });
      });

      describe('with exportAsDefault filled', () => {
        describe('overriding with { exportAsDefault: false }', () => {
          runTests(
            {
              exportAsDefault: {
                interfaceName: 'IBase',
                interfaceDocumentationComment: 'base-comment',
                valueDocumentationComment: 'base-value-comment'
              }
            },
            {
              exportAsDefault: false
            }
          );
        });

        describe("overriding with { interfaceName: 'IOverride' } ", () => {
          runTests(
            {
              exportAsDefault: {
                interfaceName: 'IBase',
                interfaceDocumentationComment: 'base-comment',
                valueDocumentationComment: 'base-value-comment'
              }
            },
            {
              exportAsDefault: {
                interfaceName: 'IOverride'
              }
            }
          );
        });

        describe('overriding with a new doc comment ', () => {
          runTests(
            {
              exportAsDefault: {
                interfaceName: 'IBase',
                interfaceDocumentationComment: 'base-comment',
                valueDocumentationComment: 'base-value-comment'
              }
            },
            {
              exportAsDefault: {
                interfaceDocumentationComment: 'doc-comment\nsecond line',
                valueDocumentationComment: 'value-comment\nsecond line'
              }
            }
          );
        });
      });
    });
  });
});
