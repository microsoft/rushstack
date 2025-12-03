// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock('node:path', () => {
  const actualPath: typeof import('path') = jest.requireActual('node:path');
  return {
    ...actualPath,
    resolve: actualPath.posix.resolve
  };
});

import { PackageMetadataManager } from '../PackageMetadataManager';
import { FileSystem, type INodePackageJson, NewlineKind } from '@rushstack/node-core-library';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function firstArgument(mockFn: jest.Mock): any {
  return mockFn.mock.calls[0][0];
}

const PACKAGE_FOLDER: '/pkg' = '/pkg';

describe(PackageMetadataManager.name, () => {
  describe(PackageMetadataManager.writeTsdocMetadataFile.name, () => {
    const originalWriteFile = FileSystem.writeFile;
    const mockWriteFile: jest.Mock = jest.fn();
    beforeAll(() => {
      FileSystem.writeFile = mockWriteFile;
    });

    afterEach(() => {
      mockWriteFile.mockClear();
    });

    afterAll(() => {
      FileSystem.writeFile = originalWriteFile;
    });

    it('writes the tsdoc metadata file at the provided path', () => {
      PackageMetadataManager.writeTsdocMetadataFile('/foo/bar', NewlineKind.CrLf);
      expect(firstArgument(mockWriteFile)).toBe('/foo/bar');
    });
  });

  describe(PackageMetadataManager.resolveTsdocMetadataPath.name, () => {
    describe.each([
      {
        tsdocMetadataPath: '',
        label: 'when an empty tsdocMetadataPath is provided'
      },
      {
        tsdocMetadataPath: 'path/to/custom-tsdoc-metadata.json',
        label: 'when a non-empty tsdocMetadataPath is provided',
        itValue:
          'outputs the tsdoc metadata file at the provided path in the folder where package.json is located',
        overrideExpected: `${PACKAGE_FOLDER}/path/to/custom-tsdoc-metadata.json`
      }
    ])('$label', ({ tsdocMetadataPath, itValue, overrideExpected }) => {
      function testForPackageJson(
        packageJson: INodePackageJson,
        options:
          | { expectsPackageRoot: true }
          | {
              expectedPathInsidePackage: string;
            }
      ): void {
        const { expectsPackageRoot, expectedPathInsidePackage } = options as {
          expectsPackageRoot: true;
        } & {
          expectedPathInsidePackage: string;
        };
        const resolvedTsdocMetadataPath: string = PackageMetadataManager.resolveTsdocMetadataPath(
          PACKAGE_FOLDER,
          packageJson,
          tsdocMetadataPath
        );
        if (overrideExpected) {
          expect(resolvedTsdocMetadataPath).toBe(overrideExpected);
        } else if (expectsPackageRoot) {
          expect(resolvedTsdocMetadataPath).toBe(`${PACKAGE_FOLDER}/tsdoc-metadata.json`);
        } else {
          expect(resolvedTsdocMetadataPath).toBe(
            `${PACKAGE_FOLDER}/${expectedPathInsidePackage}/tsdoc-metadata.json`
          );
        }
      }

      describe('given a package.json where the field "tsdocMetadata" is defined', () => {
        it(
          itValue ??
            'outputs the tsdoc metadata path as given by "tsdocMetadata" relative to the folder of package.json',
          () => {
            testForPackageJson(
              {
                name: 'package-inferred-from-tsdoc-metadata',
                version: '1.0.0',
                main: 'path/to/main.js',
                typings: 'path/to/typings/typings.d.ts',
                tsdocMetadata: 'path/to/tsdoc-metadata/tsdoc-metadata.json'
              },
              {
                expectedPathInsidePackage: 'path/to/tsdoc-metadata'
              }
            );
          }
        );
      });

      describe('given a package.json where the field "exports" is defined', () => {
        describe('with a string value', () => {
          testForPackageJson(
            {
              name: 'package-inferred-from-exports',
              version: '1.0.0',
              exports: 'path/to/exports/exports.js'
            },
            { expectedPathInsidePackage: 'path/to/exports' }
          );
        });

        describe('with an array value', () => {
          testForPackageJson(
            {
              name: 'package-inferred-from-exports',
              version: '1.0.0',
              exports: ['path/to/exports/exports.js', 'path/to/exports2/exports.js']
            },
            { expectedPathInsidePackage: 'path/to/exports' }
          );
        });

        describe.each(['.', '*'])('with an exports field that contains a "%s" key', (exportsKey) => {
          describe('with a string value', () => {
            it(
              itValue ??
                `outputs the tsdoc metadata file "tsdoc-metadata.json" in the same folder as the path of "${exportsKey}"`,
              () => {
                testForPackageJson(
                  {
                    name: 'package-inferred-from-exports',
                    version: '1.0.0',
                    exports: {
                      [exportsKey]: 'path/to/exports/exports.js'
                    }
                  },
                  { expectedPathInsidePackage: 'path/to/exports' }
                );
              }
            );
          });

          describe('with an object value that does not include a "types" key', () => {
            it(itValue ?? 'outputs the tsdoc metadata file "tsdoc-metadata.json" in the package root', () => {
              testForPackageJson(
                {
                  name: 'package-inferred-from-exports',
                  version: '1.0.0',
                  exports: {
                    [exportsKey]: {
                      import: 'path/to/exports/exports.js'
                    }
                  }
                },
                { expectsPackageRoot: true }
              );
            });
          });

          describe('with an object value that does include a "types" key', () => {
            it(
              itValue ??
                `outputs the tsdoc metadata file "tsdoc-metadata.json" in the same folder as the path of "${exportsKey}"`,
              () => {
                testForPackageJson(
                  {
                    name: 'package-inferred-from-exports',
                    version: '1.0.0',
                    exports: {
                      [exportsKey]: {
                        types: 'path/to/types-exports/exports.d.ts'
                      }
                    }
                  },
                  { expectedPathInsidePackage: 'path/to/types-exports' }
                );
              }
            );
          });

          describe('that nests into an object that doesn\'t contain a "types" key', () => {
            it(itValue ?? 'outputs the tsdoc metadata file "tsdoc-metadata.json" package root', () => {
              testForPackageJson(
                {
                  name: 'package-inferred-from-exports',
                  version: '1.0.0',
                  exports: {
                    [exportsKey]: {
                      types: {
                        import: 'path/to/types-exports/exports.js'
                      }
                    }
                  }
                },
                { expectsPackageRoot: true }
              );
            });
          });

          describe('that nests into an object that contains a "types" key', () => {
            it(itValue ?? 'outputs the tsdoc metadata file "tsdoc-metadata.json" package root', () => {
              testForPackageJson(
                {
                  name: 'package-inferred-from-exports',
                  version: '1.0.0',
                  exports: {
                    [exportsKey]: {
                      types: {
                        types: 'path/to/types-exports/exports.d.ts'
                      }
                    }
                  }
                },
                { expectedPathInsidePackage: 'path/to/types-exports' }
              );
            });
          });
        });
      });

      describe('given a package.json where the field "typesVersions" is defined', () => {
        describe('with an exports field that contains a "%s" key', () => {
          describe('with no selectors', () => {
            it(itValue ?? 'outputs the tsdoc metadata file "tsdoc-metadata.json" in the package root', () => {
              testForPackageJson(
                {
                  name: 'package-inferred-from-typesVersions',
                  version: '1.0.0',
                  typesVersions: {}
                },
                { expectsPackageRoot: true }
              );
            });
          });

          describe.each(['.', '*'])('with a %s selector', (pathSelector) => {
            it(
              itValue ?? 'outputs the tsdoc metadata file "tsdoc-metadata.json" in the path selected',
              () => {
                testForPackageJson(
                  {
                    name: 'package-inferred-from-typesVersions',
                    version: '1.0.0',
                    typesVersions: {
                      '>=3.0': {
                        [pathSelector]: ['path/to/types-exports/exports.d.ts']
                      }
                    }
                  },
                  { expectedPathInsidePackage: 'path/to/types-exports' }
                );
              }
            );
          });

          describe('with multiple TypeScript versions', () => {
            describe.each(['.', '*'])('with a %s selector', (pathSelector) => {
              it(
                itValue ??
                  'outputs the tsdoc metadata file "tsdoc-metadata.json" in the path selected for the latest TypeScript version',
                () => {
                  testForPackageJson(
                    {
                      name: 'package-inferred-from-typesVersions',
                      version: '1.0.0',
                      typesVersions: {
                        '>=3.6': {
                          [pathSelector]: ['path/to/types-exports-3.6/exports.d.ts']
                        },
                        '>=3.0': {
                          [pathSelector]: ['path/to/types-exports-3.0/exports.d.ts']
                        },
                        '~4.0': {
                          [pathSelector]: ['path/to/types-exports-4.0/exports.d.ts']
                        }
                      }
                    },
                    { expectedPathInsidePackage: 'path/to/types-exports-4.0' }
                  );
                }
              );
            });
          });
        });
      });

      describe('given a package.json where the field "types" is defined', () => {
        it(
          itValue ??
            'outputs the tsdoc metadata file "tsdoc-metadata.json" in the same folder as the path of "types"',
          () => {
            testForPackageJson(
              {
                name: 'package-inferred-from-types',
                version: '1.0.0',
                main: 'path/to/main.js',
                types: 'path/to/types/types.d.ts'
              },
              { expectedPathInsidePackage: 'path/to/types' }
            );
          }
        );
      });

      describe('given a package.json where the field "types" and "typings" are defined', () => {
        it(
          itValue ??
            'outputs the tsdoc metadata file "tsdoc-metadata.json" in the same folder as the path of "types"',
          () => {
            testForPackageJson(
              {
                name: 'package-inferred-from-types',
                version: '1.0.0',
                main: 'path/to/main.js',
                types: 'path/to/types/types.d.ts',
                typings: 'path/to/typings/typings.d.ts'
              },
              { expectedPathInsidePackage: 'path/to/types' }
            );
          }
        );
      });

      describe('given a package.json where the field "typings" is defined and "types" is not defined', () => {
        it(
          itValue ??
            'outputs the tsdoc metadata file "tsdoc-metadata.json" in the same folder as the path of "typings"',
          () => {
            testForPackageJson(
              {
                name: 'package-inferred-from-typings',
                version: '1.0.0',
                main: 'path/to/main.js',
                typings: 'path/to/typings/typings.d.ts'
              },
              { expectedPathInsidePackage: 'path/to/typings' }
            );
          }
        );
      });

      describe('given a package.json where the field "main" is defined', () => {
        it(
          itValue ??
            'outputs the tsdoc metadata file "tsdoc-metadata.json" in the same folder as the path of "main"',
          () => {
            testForPackageJson(
              {
                name: 'package-inferred-from-main',
                version: '1.0.0',
                main: 'path/to/main/main.js'
              },
              { expectedPathInsidePackage: 'path/to/main' }
            );
          }
        );
      });

      describe(
        'given a package.json where the fields "exports", "typesVersions", "types", "main", "typings" ' +
          'and "tsdocMetadata" are not defined',
        () => {
          it(
            itValue ??
              'outputs the tsdoc metadata file "tsdoc-metadata.json" in the folder where package.json is located',
            () => {
              testForPackageJson(
                {
                  name: 'package-default',
                  version: '1.0.0'
                },
                { expectsPackageRoot: true }
              );
            }
          );
        }
      );
    });

    it('correctly resolves the tsdoc-metadata with the right precedence', () => {
      const packageJson: INodePackageJson = {
        name: 'package-inferred-tsdoc-metadata',
        tsdocMetadata: 'path/to/tsdoc-metadata/tsdoc-metadata.json',
        exports: {
          '.': 'path/to/exports-dot/exports.js',
          '*': 'path/to/exports-star/*.js'
        },
        typesVersions: {
          '>=3.0': {
            '.': ['path/to/typesVersions-dot/exports.d.ts'],
            '*': ['path/to/typesVersions-star/*.d.ts']
          }
        },
        types: 'path/to/types/types.d.ts',
        typings: 'path/to/typings/typings.d.ts',
        main: 'path/to/main/main.js'
      };

      expect(PackageMetadataManager.resolveTsdocMetadataPath(PACKAGE_FOLDER, packageJson)).toBe(
        `${PACKAGE_FOLDER}/path/to/tsdoc-metadata/tsdoc-metadata.json`
      );
      delete packageJson.tsdocMetadata;
      expect(PackageMetadataManager.resolveTsdocMetadataPath(PACKAGE_FOLDER, packageJson)).toBe(
        `${PACKAGE_FOLDER}/path/to/exports-dot/tsdoc-metadata.json`
      );
      delete (packageJson.exports as { '.': unknown })!['.'];
      expect(PackageMetadataManager.resolveTsdocMetadataPath(PACKAGE_FOLDER, packageJson)).toBe(
        `${PACKAGE_FOLDER}/path/to/exports-star/tsdoc-metadata.json`
      );
      delete packageJson.exports;
      expect(PackageMetadataManager.resolveTsdocMetadataPath(PACKAGE_FOLDER, packageJson)).toBe(
        `${PACKAGE_FOLDER}/path/to/typesVersions-dot/tsdoc-metadata.json`
      );
      delete packageJson.typesVersions!['>=3.0']!['.'];
      expect(PackageMetadataManager.resolveTsdocMetadataPath(PACKAGE_FOLDER, packageJson)).toBe(
        `${PACKAGE_FOLDER}/path/to/typesVersions-star/tsdoc-metadata.json`
      );
      delete packageJson.typesVersions;
      expect(PackageMetadataManager.resolveTsdocMetadataPath(PACKAGE_FOLDER, packageJson)).toBe(
        `${PACKAGE_FOLDER}/path/to/types/tsdoc-metadata.json`
      );
      delete packageJson.types;
      expect(PackageMetadataManager.resolveTsdocMetadataPath(PACKAGE_FOLDER, packageJson)).toBe(
        `${PACKAGE_FOLDER}/path/to/typings/tsdoc-metadata.json`
      );
      delete packageJson.typings;
      expect(PackageMetadataManager.resolveTsdocMetadataPath(PACKAGE_FOLDER, packageJson)).toBe(
        `${PACKAGE_FOLDER}/path/to/main/tsdoc-metadata.json`
      );
      delete packageJson.main;
      expect(PackageMetadataManager.resolveTsdocMetadataPath(PACKAGE_FOLDER, packageJson)).toBe(
        `${PACKAGE_FOLDER}/tsdoc-metadata.json`
      );
    });
  });
});
