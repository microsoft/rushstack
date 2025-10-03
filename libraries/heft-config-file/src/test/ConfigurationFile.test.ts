// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import nodeJsPath from 'node:path';
import { FileSystem, JsonFile, Path, Text } from '@rushstack/node-core-library';
import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';
import { RigConfig } from '@rushstack/rig-package';

import { ProjectConfigurationFile } from '../ProjectConfigurationFile';
import { PathResolutionMethod, InheritanceType, ConfigurationFileBase } from '../ConfigurationFileBase';
import { NonProjectConfigurationFile } from '../NonProjectConfigurationFile';

describe('ConfigurationFile', () => {
  const projectRoot: string = nodeJsPath.resolve(__dirname, '../..');
  let terminalProvider: StringBufferTerminalProvider;
  let terminal: Terminal;

  beforeEach(() => {
    const formatPathForLogging: (path: string) => string = (path: string) =>
      `<project root>/${Path.convertToSlashes(nodeJsPath.relative(projectRoot, path))}`;
    jest.spyOn(ConfigurationFileBase, '_formatPathForLogging').mockImplementation(formatPathForLogging);
    jest.spyOn(JsonFile, '_formatPathForError').mockImplementation(formatPathForLogging);

    terminalProvider = new StringBufferTerminalProvider(false);
    terminal = new Terminal(terminalProvider);
  });

  afterEach(() => {
    expect({
      log: terminalProvider.getOutput(),
      warning: terminalProvider.getWarningOutput(),
      error: terminalProvider.getErrorOutput(),
      verbose: terminalProvider.getVerboseOutput(),
      debug: terminalProvider.getDebugOutput()
    }).toMatchSnapshot();
  });

  describe('A simple config file', () => {
    const configFileFolderName: string = 'simplestConfigFile';
    function runTests(partialOptions: { jsonSchemaPath: string } | { jsonSchemaObject: object }): void {
      const projectRelativeFilePath: string = `${configFileFolderName}/simplestConfigFile.json`;

      interface ISimplestConfigFile {
        thing: string;
      }

      it('Correctly loads the config file', () => {
        const configFileLoader: ProjectConfigurationFile<ISimplestConfigFile> =
          new ProjectConfigurationFile<ISimplestConfigFile>({
            projectRelativeFilePath: projectRelativeFilePath,
            ...partialOptions
          });
        const loadedConfigFile: ISimplestConfigFile = configFileLoader.loadConfigurationFileForProject(
          terminal,
          __dirname
        );
        const expectedConfigFile: ISimplestConfigFile = { thing: 'A' };

        expect(JSON.stringify(loadedConfigFile)).toEqual(JSON.stringify(expectedConfigFile));
        expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile)).toEqual(
          nodeJsPath.resolve(__dirname, projectRelativeFilePath)
        );
        expect(
          configFileLoader.getPropertyOriginalValue({ parentObject: loadedConfigFile, propertyName: 'thing' })
        ).toEqual('A');
      });

      it('Correctly loads the config file async', async () => {
        const configFileLoader: ProjectConfigurationFile<ISimplestConfigFile> =
          new ProjectConfigurationFile<ISimplestConfigFile>({
            projectRelativeFilePath: projectRelativeFilePath,
            ...partialOptions
          });
        const loadedConfigFile: ISimplestConfigFile =
          await configFileLoader.loadConfigurationFileForProjectAsync(terminal, __dirname);
        const expectedConfigFile: ISimplestConfigFile = { thing: 'A' };

        expect(JSON.stringify(loadedConfigFile)).toEqual(JSON.stringify(expectedConfigFile));
        expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile)).toEqual(
          nodeJsPath.resolve(__dirname, projectRelativeFilePath)
        );
        expect(
          configFileLoader.getPropertyOriginalValue({ parentObject: loadedConfigFile, propertyName: 'thing' })
        ).toEqual('A');
      });

      it('Correctly resolves paths relative to the config file', () => {
        const configFileLoader: ProjectConfigurationFile<ISimplestConfigFile> =
          new ProjectConfigurationFile<ISimplestConfigFile>({
            projectRelativeFilePath: projectRelativeFilePath,
            ...partialOptions,
            jsonPathMetadata: {
              '$.thing': {
                pathResolutionMethod: PathResolutionMethod.resolvePathRelativeToConfigurationFile
              }
            }
          });
        const loadedConfigFile: ISimplestConfigFile = configFileLoader.loadConfigurationFileForProject(
          terminal,
          __dirname
        );
        const expectedConfigFile: ISimplestConfigFile = {
          thing: nodeJsPath.resolve(__dirname, configFileFolderName, 'A')
        };
        expect(JSON.stringify(loadedConfigFile)).toEqual(JSON.stringify(expectedConfigFile));
        expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile)).toEqual(
          nodeJsPath.resolve(__dirname, projectRelativeFilePath)
        );
        expect(
          configFileLoader.getPropertyOriginalValue({ parentObject: loadedConfigFile, propertyName: 'thing' })
        ).toEqual('A');
      });

      it('Correctly resolves paths relative to the config file async', async () => {
        const configFileLoader: ProjectConfigurationFile<ISimplestConfigFile> =
          new ProjectConfigurationFile<ISimplestConfigFile>({
            projectRelativeFilePath: projectRelativeFilePath,
            ...partialOptions,
            jsonPathMetadata: {
              '$.thing': {
                pathResolutionMethod: PathResolutionMethod.resolvePathRelativeToConfigurationFile
              }
            }
          });
        const loadedConfigFile: ISimplestConfigFile =
          await configFileLoader.loadConfigurationFileForProjectAsync(terminal, __dirname);
        const expectedConfigFile: ISimplestConfigFile = {
          thing: nodeJsPath.resolve(__dirname, configFileFolderName, 'A')
        };
        expect(JSON.stringify(loadedConfigFile)).toEqual(JSON.stringify(expectedConfigFile));
        expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile)).toEqual(
          nodeJsPath.resolve(__dirname, projectRelativeFilePath)
        );
        expect(
          configFileLoader.getPropertyOriginalValue({ parentObject: loadedConfigFile, propertyName: 'thing' })
        ).toEqual('A');
      });

      it('Correctly resolves paths relative to the project root', () => {
        const configFileLoader: ProjectConfigurationFile<ISimplestConfigFile> =
          new ProjectConfigurationFile<ISimplestConfigFile>({
            projectRelativeFilePath: projectRelativeFilePath,
            ...partialOptions,
            jsonPathMetadata: {
              '$.thing': {
                pathResolutionMethod: PathResolutionMethod.resolvePathRelativeToProjectRoot
              }
            }
          });
        const loadedConfigFile: ISimplestConfigFile = configFileLoader.loadConfigurationFileForProject(
          terminal,
          __dirname
        );
        const expectedConfigFile: ISimplestConfigFile = {
          thing: nodeJsPath.resolve(projectRoot, 'A')
        };
        expect(JSON.stringify(loadedConfigFile)).toEqual(JSON.stringify(expectedConfigFile));
        expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile)).toEqual(
          nodeJsPath.resolve(__dirname, projectRelativeFilePath)
        );
        expect(
          configFileLoader.getPropertyOriginalValue({ parentObject: loadedConfigFile, propertyName: 'thing' })
        ).toEqual('A');
      });

      it('Correctly resolves paths relative to the project root async', async () => {
        const configFileLoader: ProjectConfigurationFile<ISimplestConfigFile> =
          new ProjectConfigurationFile<ISimplestConfigFile>({
            projectRelativeFilePath: projectRelativeFilePath,
            ...partialOptions,
            jsonPathMetadata: {
              '$.thing': {
                pathResolutionMethod: PathResolutionMethod.resolvePathRelativeToProjectRoot
              }
            }
          });
        const loadedConfigFile: ISimplestConfigFile =
          await configFileLoader.loadConfigurationFileForProjectAsync(terminal, __dirname);
        const expectedConfigFile: ISimplestConfigFile = {
          thing: nodeJsPath.resolve(projectRoot, 'A')
        };
        expect(JSON.stringify(loadedConfigFile)).toEqual(JSON.stringify(expectedConfigFile));
        expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile)).toEqual(
          nodeJsPath.resolve(__dirname, projectRelativeFilePath)
        );
        expect(
          configFileLoader.getPropertyOriginalValue({ parentObject: loadedConfigFile, propertyName: 'thing' })
        ).toEqual('A');
      });

      it(`The ${NonProjectConfigurationFile.name} version works correctly`, () => {
        const configFileLoader: NonProjectConfigurationFile<ISimplestConfigFile> =
          new NonProjectConfigurationFile(partialOptions);
        const loadedConfigFile: ISimplestConfigFile = configFileLoader.loadConfigurationFile(
          terminal,
          `${__dirname}/${projectRelativeFilePath}`
        );
        const expectedConfigFile: ISimplestConfigFile = { thing: 'A' };

        expect(JSON.stringify(loadedConfigFile)).toEqual(JSON.stringify(expectedConfigFile));
        expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile)).toEqual(
          `${__dirname}/${projectRelativeFilePath}`
        );
        expect(
          configFileLoader.getPropertyOriginalValue({ parentObject: loadedConfigFile, propertyName: 'thing' })
        ).toEqual('A');
      });

      it(`The ${NonProjectConfigurationFile.name} version works correctly async`, async () => {
        const configFileLoader: NonProjectConfigurationFile<ISimplestConfigFile> =
          new NonProjectConfigurationFile<ISimplestConfigFile>(partialOptions);
        const loadedConfigFile: ISimplestConfigFile = await configFileLoader.loadConfigurationFileAsync(
          terminal,
          `${__dirname}/${projectRelativeFilePath}`
        );
        const expectedConfigFile: ISimplestConfigFile = { thing: 'A' };

        expect(JSON.stringify(loadedConfigFile)).toEqual(JSON.stringify(expectedConfigFile));
        expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile)).toEqual(
          `${__dirname}/${projectRelativeFilePath}`
        );
        expect(
          configFileLoader.getPropertyOriginalValue({ parentObject: loadedConfigFile, propertyName: 'thing' })
        ).toEqual('A');
      });
    }

    describe('with a JSON schema path', () => {
      runTests({ jsonSchemaPath: `${__dirname}/${configFileFolderName}/simplestConfigFile.schema.json` });
    });

    describe('with a JSON schema object', () => {
      runTests({
        jsonSchemaObject: JsonFile.load(`${__dirname}/${configFileFolderName}/simplestConfigFile.schema.json`)
      });
    });
  });

  describe('A simple config file containing an array and an object', () => {
    const configFileFolderName: string = 'simpleConfigFile';
    const projectRelativeFilePath: string = `${configFileFolderName}/simpleConfigFile.json`;
    const schemaPath: string = `${__dirname}/${configFileFolderName}/simpleConfigFile.schema.json`;

    interface ISimpleConfigFile {
      things: string[];
      thingsObj: { A: { B: string }; D: { E: string } };
      booleanProp: boolean;
      stringProp?: string;
    }

    it('Correctly loads the config file', () => {
      const configFileLoader: ProjectConfigurationFile<ISimpleConfigFile> =
        new ProjectConfigurationFile<ISimpleConfigFile>({
          projectRelativeFilePath,
          jsonSchemaPath: schemaPath
        });
      const loadedConfigFile: ISimpleConfigFile = configFileLoader.loadConfigurationFileForProject(
        terminal,
        __dirname
      );
      const expectedConfigFile: ISimpleConfigFile = {
        things: ['A', 'B', 'C'],
        thingsObj: { A: { B: 'C' }, D: { E: 'F' } },
        booleanProp: true,
        stringProp: 'someValue'
      };
      expect(JSON.stringify(loadedConfigFile)).toEqual(JSON.stringify(expectedConfigFile));
    });

    it('Correctly loads the config file async', async () => {
      const configFileLoader: ProjectConfigurationFile<ISimpleConfigFile> =
        new ProjectConfigurationFile<ISimpleConfigFile>({
          projectRelativeFilePath,
          jsonSchemaPath: schemaPath
        });
      const loadedConfigFile: ISimpleConfigFile = await configFileLoader.loadConfigurationFileForProjectAsync(
        terminal,
        __dirname
      );
      const expectedConfigFile: ISimpleConfigFile = {
        things: ['A', 'B', 'C'],
        thingsObj: { A: { B: 'C' }, D: { E: 'F' } },
        booleanProp: true,
        stringProp: 'someValue'
      };
      expect(JSON.stringify(loadedConfigFile)).toEqual(JSON.stringify(expectedConfigFile));
    });

    it('Correctly resolves paths relative to the config file', () => {
      const configFileLoader: ProjectConfigurationFile<ISimpleConfigFile> =
        new ProjectConfigurationFile<ISimpleConfigFile>({
          projectRelativeFilePath,
          jsonSchemaPath: schemaPath,
          jsonPathMetadata: {
            '$.things.*': {
              pathResolutionMethod: PathResolutionMethod.resolvePathRelativeToConfigurationFile
            },
            '$.thingsObj.*.*': {
              pathResolutionMethod: PathResolutionMethod.resolvePathRelativeToConfigurationFile
            }
          }
        });
      const loadedConfigFile: ISimpleConfigFile = configFileLoader.loadConfigurationFileForProject(
        terminal,
        __dirname
      );
      const expectedConfigFile: ISimpleConfigFile = {
        things: [
          nodeJsPath.resolve(__dirname, configFileFolderName, 'A'),
          nodeJsPath.resolve(__dirname, configFileFolderName, 'B'),
          nodeJsPath.resolve(__dirname, configFileFolderName, 'C')
        ],
        thingsObj: {
          A: { B: nodeJsPath.resolve(__dirname, configFileFolderName, 'C') },
          D: { E: nodeJsPath.resolve(__dirname, configFileFolderName, 'F') }
        },
        booleanProp: true,
        stringProp: 'someValue'
      };
      expect(JSON.stringify(loadedConfigFile)).toEqual(JSON.stringify(expectedConfigFile));
    });

    it('Correctly resolves paths relative to the config file async', async () => {
      const configFileLoader: ProjectConfigurationFile<ISimpleConfigFile> =
        new ProjectConfigurationFile<ISimpleConfigFile>({
          projectRelativeFilePath,
          jsonSchemaPath: schemaPath,
          jsonPathMetadata: {
            '$.things.*': {
              pathResolutionMethod: PathResolutionMethod.resolvePathRelativeToConfigurationFile
            },
            '$.thingsObj.*.*': {
              pathResolutionMethod: PathResolutionMethod.resolvePathRelativeToConfigurationFile
            }
          }
        });
      const loadedConfigFile: ISimpleConfigFile = await configFileLoader.loadConfigurationFileForProjectAsync(
        terminal,
        __dirname
      );
      const expectedConfigFile: ISimpleConfigFile = {
        things: [
          nodeJsPath.resolve(__dirname, configFileFolderName, 'A'),
          nodeJsPath.resolve(__dirname, configFileFolderName, 'B'),
          nodeJsPath.resolve(__dirname, configFileFolderName, 'C')
        ],
        thingsObj: {
          A: { B: nodeJsPath.resolve(__dirname, configFileFolderName, 'C') },
          D: { E: nodeJsPath.resolve(__dirname, configFileFolderName, 'F') }
        },
        booleanProp: true,
        stringProp: 'someValue'
      };
      expect(JSON.stringify(loadedConfigFile)).toEqual(JSON.stringify(expectedConfigFile));
    });

    it('Correctly resolves paths relative to the project root', () => {
      const configFileLoader: ProjectConfigurationFile<ISimpleConfigFile> =
        new ProjectConfigurationFile<ISimpleConfigFile>({
          projectRelativeFilePath,
          jsonSchemaPath: schemaPath,
          jsonPathMetadata: {
            '$.things.*': {
              pathResolutionMethod: PathResolutionMethod.resolvePathRelativeToProjectRoot
            },
            '$.thingsObj.*.*': {
              pathResolutionMethod: PathResolutionMethod.resolvePathRelativeToProjectRoot
            }
          }
        });
      const loadedConfigFile: ISimpleConfigFile = configFileLoader.loadConfigurationFileForProject(
        terminal,
        __dirname
      );
      const expectedConfigFile: ISimpleConfigFile = {
        things: [
          nodeJsPath.resolve(projectRoot, 'A'),
          nodeJsPath.resolve(projectRoot, 'B'),
          nodeJsPath.resolve(projectRoot, 'C')
        ],
        thingsObj: {
          A: { B: nodeJsPath.resolve(projectRoot, 'C') },
          D: { E: nodeJsPath.resolve(projectRoot, 'F') }
        },
        booleanProp: true,
        stringProp: 'someValue'
      };
      expect(JSON.stringify(loadedConfigFile)).toEqual(JSON.stringify(expectedConfigFile));
    });

    it('Correctly resolves paths relative to the project root async', async () => {
      const configFileLoader: ProjectConfigurationFile<ISimpleConfigFile> =
        new ProjectConfigurationFile<ISimpleConfigFile>({
          projectRelativeFilePath,
          jsonSchemaPath: schemaPath,
          jsonPathMetadata: {
            '$.things.*': {
              pathResolutionMethod: PathResolutionMethod.resolvePathRelativeToProjectRoot
            },
            '$.thingsObj.*.*': {
              pathResolutionMethod: PathResolutionMethod.resolvePathRelativeToProjectRoot
            }
          }
        });
      const loadedConfigFile: ISimpleConfigFile = await configFileLoader.loadConfigurationFileForProjectAsync(
        terminal,
        __dirname
      );
      const expectedConfigFile: ISimpleConfigFile = {
        things: [
          nodeJsPath.resolve(projectRoot, 'A'),
          nodeJsPath.resolve(projectRoot, 'B'),
          nodeJsPath.resolve(projectRoot, 'C')
        ],
        thingsObj: {
          A: { B: nodeJsPath.resolve(projectRoot, 'C') },
          D: { E: nodeJsPath.resolve(projectRoot, 'F') }
        },
        booleanProp: true,
        stringProp: 'someValue'
      };
      expect(JSON.stringify(loadedConfigFile)).toEqual(JSON.stringify(expectedConfigFile));
    });
  });

  describe('A simple config file with "extends"', () => {
    const configFileFolderName: string = 'simpleConfigFileWithExtends';
    const projectRelativeFilePath: string = `${configFileFolderName}/simpleConfigFileWithExtends.json`;
    const schemaPath: string = `${__dirname}/${configFileFolderName}/simpleConfigFileWithExtends.schema.json`;

    interface ISimpleConfigFile {
      things: string[];
      thingsObj: { A: { B?: string; D?: string }; D?: { E: string }; F?: { G: string } };
      booleanProp: boolean;
      stringProp?: string;
    }

    it('Correctly loads the config file with default config meta', () => {
      const expectedConfigFile: ISimpleConfigFile = {
        things: ['A', 'B', 'C', 'D', 'E'],
        thingsObj: { A: { D: 'E' }, F: { G: 'H' } },
        booleanProp: false
      };

      const configFileLoader: ProjectConfigurationFile<ISimpleConfigFile> =
        new ProjectConfigurationFile<ISimpleConfigFile>({
          projectRelativeFilePath,
          jsonSchemaPath: schemaPath
        });
      const loadedConfigFile: ISimpleConfigFile = configFileLoader.loadConfigurationFileForProject(
        terminal,
        __dirname
      );
      expect(JSON.stringify(loadedConfigFile)).toEqual(JSON.stringify(expectedConfigFile));

      const nonProjectConfigFileLoader: NonProjectConfigurationFile<ISimpleConfigFile> =
        new NonProjectConfigurationFile({
          jsonSchemaPath: schemaPath
        });
      const nonProjectLoadedConfigFile: ISimpleConfigFile = nonProjectConfigFileLoader.loadConfigurationFile(
        terminal,
        `${__dirname}/${projectRelativeFilePath}`
      );
      expect(JSON.stringify(nonProjectLoadedConfigFile)).toEqual(JSON.stringify(expectedConfigFile));
    });

    it('Correctly loads the config file with default config meta async', async () => {
      const expectedConfigFile: ISimpleConfigFile = {
        things: ['A', 'B', 'C', 'D', 'E'],
        thingsObj: { A: { D: 'E' }, F: { G: 'H' } },
        booleanProp: false
      };

      const configFileLoader: ProjectConfigurationFile<ISimpleConfigFile> =
        new ProjectConfigurationFile<ISimpleConfigFile>({
          projectRelativeFilePath,
          jsonSchemaPath: schemaPath
        });
      const loadedConfigFile: ISimpleConfigFile = await configFileLoader.loadConfigurationFileForProjectAsync(
        terminal,
        __dirname
      );

      expect(JSON.stringify(loadedConfigFile)).toEqual(JSON.stringify(expectedConfigFile));

      const nonProjectConfigFileLoader: NonProjectConfigurationFile<ISimpleConfigFile> =
        new NonProjectConfigurationFile({
          jsonSchemaPath: schemaPath
        });
      const nonProjectLoadedConfigFile: ISimpleConfigFile =
        await nonProjectConfigFileLoader.loadConfigurationFileAsync(
          terminal,
          `${__dirname}/${projectRelativeFilePath}`
        );
      expect(JSON.stringify(nonProjectLoadedConfigFile)).toEqual(JSON.stringify(expectedConfigFile));
    });

    it('Correctly loads the config file with "append" and "merge" in config meta', () => {
      const configFileLoader: ProjectConfigurationFile<ISimpleConfigFile> =
        new ProjectConfigurationFile<ISimpleConfigFile>({
          projectRelativeFilePath,
          jsonSchemaPath: schemaPath,
          propertyInheritance: {
            things: {
              inheritanceType: InheritanceType.append
            },
            thingsObj: {
              inheritanceType: InheritanceType.merge
            }
          }
        });
      const loadedConfigFile: ISimpleConfigFile = configFileLoader.loadConfigurationFileForProject(
        terminal,
        __dirname
      );
      const expectedConfigFile: ISimpleConfigFile = {
        things: ['A', 'B', 'C', 'D', 'E'],
        thingsObj: { A: { D: 'E' }, D: { E: 'F' }, F: { G: 'H' } },
        booleanProp: false
      };
      expect(JSON.stringify(loadedConfigFile)).toEqual(JSON.stringify(expectedConfigFile));
    });

    it('Correctly loads the config file with "append" and "merge" in config meta async', async () => {
      const configFileLoader: ProjectConfigurationFile<ISimpleConfigFile> =
        new ProjectConfigurationFile<ISimpleConfigFile>({
          projectRelativeFilePath,
          jsonSchemaPath: schemaPath,
          propertyInheritance: {
            things: {
              inheritanceType: InheritanceType.append
            },
            thingsObj: {
              inheritanceType: InheritanceType.merge
            }
          }
        });
      const loadedConfigFile: ISimpleConfigFile = await configFileLoader.loadConfigurationFileForProjectAsync(
        terminal,
        __dirname
      );
      const expectedConfigFile: ISimpleConfigFile = {
        things: ['A', 'B', 'C', 'D', 'E'],
        thingsObj: { A: { D: 'E' }, D: { E: 'F' }, F: { G: 'H' } },
        booleanProp: false
      };
      expect(JSON.stringify(loadedConfigFile)).toEqual(JSON.stringify(expectedConfigFile));
    });

    it('Correctly loads the config file with "replace" in config meta', () => {
      const configFileLoader: ProjectConfigurationFile<ISimpleConfigFile> =
        new ProjectConfigurationFile<ISimpleConfigFile>({
          projectRelativeFilePath,
          jsonSchemaPath: schemaPath,
          propertyInheritance: {
            things: {
              inheritanceType: InheritanceType.replace
            },
            thingsObj: {
              inheritanceType: InheritanceType.replace
            }
          }
        });
      const loadedConfigFile: ISimpleConfigFile = configFileLoader.loadConfigurationFileForProject(
        terminal,
        __dirname
      );
      const expectedConfigFile: ISimpleConfigFile = {
        things: ['D', 'E'],
        thingsObj: { A: { D: 'E' }, F: { G: 'H' } },
        booleanProp: false
      };
      expect(JSON.stringify(loadedConfigFile)).toEqual(JSON.stringify(expectedConfigFile));
    });

    it('Correctly loads the config file with "replace" in config meta async', async () => {
      const configFileLoader: ProjectConfigurationFile<ISimpleConfigFile> =
        new ProjectConfigurationFile<ISimpleConfigFile>({
          projectRelativeFilePath,
          jsonSchemaPath: schemaPath,
          propertyInheritance: {
            things: {
              inheritanceType: InheritanceType.replace
            },
            thingsObj: {
              inheritanceType: InheritanceType.replace
            }
          }
        });
      const loadedConfigFile: ISimpleConfigFile = await configFileLoader.loadConfigurationFileForProjectAsync(
        terminal,
        __dirname
      );
      const expectedConfigFile: ISimpleConfigFile = {
        things: ['D', 'E'],
        thingsObj: { A: { D: 'E' }, F: { G: 'H' } },
        booleanProp: false
      };
      expect(JSON.stringify(loadedConfigFile)).toEqual(JSON.stringify(expectedConfigFile));
    });

    it('Correctly loads the config file with modified merge behaviors for arrays and objects', () => {
      const configFileLoader: ProjectConfigurationFile<ISimpleConfigFile> =
        new ProjectConfigurationFile<ISimpleConfigFile>({
          projectRelativeFilePath,
          jsonSchemaPath: schemaPath,
          propertyInheritanceDefaults: {
            array: { inheritanceType: InheritanceType.replace },
            object: { inheritanceType: InheritanceType.merge }
          }
        });
      const loadedConfigFile: ISimpleConfigFile = configFileLoader.loadConfigurationFileForProject(
        terminal,
        __dirname
      );
      const expectedConfigFile: ISimpleConfigFile = {
        things: ['D', 'E'],
        thingsObj: { A: { B: 'C', D: 'E' }, D: { E: 'F' }, F: { G: 'H' } },
        booleanProp: false
      };
      expect(JSON.stringify(loadedConfigFile)).toEqual(JSON.stringify(expectedConfigFile));
    });

    it('Correctly loads the config file with modified merge behaviors for arrays and objects async', async () => {
      const configFileLoader: ProjectConfigurationFile<ISimpleConfigFile> =
        new ProjectConfigurationFile<ISimpleConfigFile>({
          projectRelativeFilePath,
          jsonSchemaPath: schemaPath,
          propertyInheritanceDefaults: {
            array: { inheritanceType: InheritanceType.replace },
            object: { inheritanceType: InheritanceType.merge }
          }
        });
      const loadedConfigFile: ISimpleConfigFile = await configFileLoader.loadConfigurationFileForProjectAsync(
        terminal,
        __dirname
      );
      const expectedConfigFile: ISimpleConfigFile = {
        things: ['D', 'E'],
        thingsObj: { A: { B: 'C', D: 'E' }, D: { E: 'F' }, F: { G: 'H' } },
        booleanProp: false
      };
      expect(JSON.stringify(loadedConfigFile)).toEqual(JSON.stringify(expectedConfigFile));
    });

    it('Correctly loads the config file with "custom" in config meta', () => {
      const configFileLoader: ProjectConfigurationFile<ISimpleConfigFile> =
        new ProjectConfigurationFile<ISimpleConfigFile>({
          projectRelativeFilePath,
          jsonSchemaPath: schemaPath,
          propertyInheritance: {
            things: {
              inheritanceType: InheritanceType.custom,
              inheritanceFunction: (current: string[], parent: string[]) => ['X', 'Y', 'Z']
            },
            thingsObj: {
              inheritanceType: InheritanceType.custom,
              inheritanceFunction: (
                current: { A: { B?: string; D?: string }; D?: { E: string }; F?: { G: string } },
                parent: { A: { B?: string; D?: string }; D?: { E: string }; F?: { G: string } }
              ) => {
                return {
                  A: { B: 'Y', D: 'Z' }
                };
              }
            }
          }
        });
      const loadedConfigFile: ISimpleConfigFile = configFileLoader.loadConfigurationFileForProject(
        terminal,
        __dirname
      );
      const expectedConfigFile: ISimpleConfigFile = {
        things: ['X', 'Y', 'Z'],
        thingsObj: { A: { B: 'Y', D: 'Z' } },
        booleanProp: false
      };
      expect(JSON.stringify(loadedConfigFile)).toEqual(JSON.stringify(expectedConfigFile));
    });

    it('Correctly loads the config file with "custom" in config meta async', async () => {
      const configFileLoader: ProjectConfigurationFile<ISimpleConfigFile> =
        new ProjectConfigurationFile<ISimpleConfigFile>({
          projectRelativeFilePath,
          jsonSchemaPath: schemaPath,
          propertyInheritance: {
            things: {
              inheritanceType: InheritanceType.custom,
              inheritanceFunction: (current: string[], parent: string[]) => ['X', 'Y', 'Z']
            },
            thingsObj: {
              inheritanceType: InheritanceType.custom,
              inheritanceFunction: (
                current: { A: { B?: string; D?: string }; D?: { E: string }; F?: { G: string } },
                parent: { A: { B?: string; D?: string }; D?: { E: string }; F?: { G: string } }
              ) => {
                return {
                  A: { B: 'Y', D: 'Z' }
                };
              }
            }
          }
        });
      const loadedConfigFile: ISimpleConfigFile = await configFileLoader.loadConfigurationFileForProjectAsync(
        terminal,
        __dirname
      );
      const expectedConfigFile: ISimpleConfigFile = {
        things: ['X', 'Y', 'Z'],
        thingsObj: { A: { B: 'Y', D: 'Z' } },
        booleanProp: false
      };
      expect(JSON.stringify(loadedConfigFile)).toEqual(JSON.stringify(expectedConfigFile));
    });

    it('Correctly resolves paths relative to the config file', () => {
      const configFileLoader: ProjectConfigurationFile<ISimpleConfigFile> =
        new ProjectConfigurationFile<ISimpleConfigFile>({
          projectRelativeFilePath,
          jsonSchemaPath: schemaPath,
          jsonPathMetadata: {
            '$.things.*': {
              pathResolutionMethod: PathResolutionMethod.resolvePathRelativeToConfigurationFile
            },
            '$.thingsObj.*.*': {
              pathResolutionMethod: PathResolutionMethod.resolvePathRelativeToConfigurationFile
            }
          }
        });
      const loadedConfigFile: ISimpleConfigFile = configFileLoader.loadConfigurationFileForProject(
        terminal,
        __dirname
      );
      const parentConfigFileFolder: string = nodeJsPath.resolve(
        __dirname,
        configFileFolderName,
        '..',
        'simpleConfigFile'
      );

      const expectedConfigFile: ISimpleConfigFile = {
        things: [
          nodeJsPath.resolve(parentConfigFileFolder, 'A'),
          nodeJsPath.resolve(parentConfigFileFolder, 'B'),
          nodeJsPath.resolve(parentConfigFileFolder, 'C'),
          nodeJsPath.resolve(__dirname, configFileFolderName, 'D'),
          nodeJsPath.resolve(__dirname, configFileFolderName, 'E')
        ],
        thingsObj: {
          A: { D: nodeJsPath.resolve(__dirname, configFileFolderName, 'E') },
          F: { G: nodeJsPath.resolve(__dirname, configFileFolderName, 'H') }
        },
        booleanProp: false
      };
      expect(JSON.stringify(loadedConfigFile)).toEqual(JSON.stringify(expectedConfigFile));
    });

    it('Correctly resolves paths relative to the config file async', async () => {
      const configFileLoader: ProjectConfigurationFile<ISimpleConfigFile> =
        new ProjectConfigurationFile<ISimpleConfigFile>({
          projectRelativeFilePath,
          jsonSchemaPath: schemaPath,
          jsonPathMetadata: {
            '$.things.*': {
              pathResolutionMethod: PathResolutionMethod.resolvePathRelativeToConfigurationFile
            },
            '$.thingsObj.*.*': {
              pathResolutionMethod: PathResolutionMethod.resolvePathRelativeToConfigurationFile
            }
          }
        });
      const loadedConfigFile: ISimpleConfigFile = await configFileLoader.loadConfigurationFileForProjectAsync(
        terminal,
        __dirname
      );
      const parentConfigFileFolder: string = nodeJsPath.resolve(
        __dirname,
        configFileFolderName,
        '..',
        'simpleConfigFile'
      );

      const expectedConfigFile: ISimpleConfigFile = {
        things: [
          nodeJsPath.resolve(parentConfigFileFolder, 'A'),
          nodeJsPath.resolve(parentConfigFileFolder, 'B'),
          nodeJsPath.resolve(parentConfigFileFolder, 'C'),
          nodeJsPath.resolve(__dirname, configFileFolderName, 'D'),
          nodeJsPath.resolve(__dirname, configFileFolderName, 'E')
        ],
        thingsObj: {
          A: { D: nodeJsPath.resolve(__dirname, configFileFolderName, 'E') },
          F: { G: nodeJsPath.resolve(__dirname, configFileFolderName, 'H') }
        },
        booleanProp: false
      };
      expect(JSON.stringify(loadedConfigFile)).toEqual(JSON.stringify(expectedConfigFile));
    });
  });

  describe('A complex config file', () => {
    interface IComplexConfigFile {
      plugins: { plugin: string }[];
    }

    it('Correctly loads a complex config file (Deprecated PathResolutionMethod.NodeResolve)', () => {
      const projectRelativeFilePath: string = 'complexConfigFile/pluginsD.json';
      const rootConfigFilePath: string = nodeJsPath.resolve(__dirname, 'complexConfigFile', 'pluginsA.json');
      const secondConfigFilePath: string = nodeJsPath.resolve(
        __dirname,
        'complexConfigFile',
        'pluginsB.json'
      );
      const schemaPath: string = `${__dirname}/complexConfigFile/plugins.schema.json`;

      const configFileLoader: ProjectConfigurationFile<IComplexConfigFile> =
        new ProjectConfigurationFile<IComplexConfigFile>({
          projectRelativeFilePath: projectRelativeFilePath,
          jsonSchemaPath: schemaPath,
          jsonPathMetadata: {
            '$.plugins.*.plugin': {
              pathResolutionMethod: PathResolutionMethod.NodeResolve
            }
          }
        });
      const loadedConfigFile: IComplexConfigFile = configFileLoader.loadConfigurationFileForProject(
        terminal,
        __dirname
      );
      const expectedConfigFile: IComplexConfigFile = {
        plugins: [
          {
            plugin: FileSystem.getRealPath(
              nodeJsPath.resolve(
                projectRoot,
                'node_modules',
                '@rushstack',
                'node-core-library',
                'lib',
                'index.js'
              )
            )
          },
          {
            plugin: FileSystem.getRealPath(
              nodeJsPath.resolve(projectRoot, 'node_modules', '@rushstack', 'heft', 'lib', 'index.js')
            )
          },
          {
            plugin: FileSystem.getRealPath(
              nodeJsPath.resolve(projectRoot, 'node_modules', 'jsonpath-plus', 'dist', 'index-node-cjs.cjs')
            )
          }
        ]
      };

      expect(JSON.stringify(loadedConfigFile)).toEqual(JSON.stringify(expectedConfigFile));

      expect(
        configFileLoader.getPropertyOriginalValue({
          parentObject: loadedConfigFile.plugins[0],
          propertyName: 'plugin'
        })
      ).toEqual('@rushstack/node-core-library');
      expect(
        configFileLoader.getPropertyOriginalValue({
          parentObject: loadedConfigFile.plugins[1],
          propertyName: 'plugin'
        })
      ).toEqual('@rushstack/heft');
      expect(
        configFileLoader.getPropertyOriginalValue({
          parentObject: loadedConfigFile.plugins[2],
          propertyName: 'plugin'
        })
      ).toEqual('jsonpath-plus');

      expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile.plugins[0])).toEqual(
        rootConfigFilePath
      );
      expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile.plugins[1])).toEqual(
        nodeJsPath.resolve(__dirname, secondConfigFilePath)
      );
      expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile.plugins[2])).toEqual(
        nodeJsPath.resolve(__dirname, secondConfigFilePath)
      );
    });

    it('Correctly loads a complex config file async (Deprecated PathResolutionMethod.NodeResolve)', async () => {
      const projectRelativeFilePath: string = 'complexConfigFile/pluginsD.json';
      const rootConfigFilePath: string = nodeJsPath.resolve(__dirname, 'complexConfigFile', 'pluginsA.json');
      const secondConfigFilePath: string = nodeJsPath.resolve(
        __dirname,
        'complexConfigFile',
        'pluginsB.json'
      );
      const schemaPath: string = `${__dirname}/complexConfigFile/plugins.schema.json`;

      const configFileLoader: ProjectConfigurationFile<IComplexConfigFile> =
        new ProjectConfigurationFile<IComplexConfigFile>({
          projectRelativeFilePath: projectRelativeFilePath,
          jsonSchemaPath: schemaPath,
          jsonPathMetadata: {
            '$.plugins.*.plugin': {
              pathResolutionMethod: PathResolutionMethod.NodeResolve
            }
          }
        });
      const loadedConfigFile: IComplexConfigFile =
        await configFileLoader.loadConfigurationFileForProjectAsync(terminal, __dirname);
      const expectedConfigFile: IComplexConfigFile = {
        plugins: [
          {
            plugin: await FileSystem.getRealPathAsync(
              nodeJsPath.resolve(
                projectRoot,
                'node_modules',
                '@rushstack',
                'node-core-library',
                'lib',
                'index.js'
              )
            )
          },
          {
            plugin: await FileSystem.getRealPathAsync(
              nodeJsPath.resolve(projectRoot, 'node_modules', '@rushstack', 'heft', 'lib', 'index.js')
            )
          },
          {
            plugin: await FileSystem.getRealPathAsync(
              nodeJsPath.resolve(projectRoot, 'node_modules', 'jsonpath-plus', 'dist', 'index-node-cjs.cjs')
            )
          }
        ]
      };

      expect(JSON.stringify(loadedConfigFile)).toEqual(JSON.stringify(expectedConfigFile));

      expect(
        configFileLoader.getPropertyOriginalValue({
          parentObject: loadedConfigFile.plugins[0],
          propertyName: 'plugin'
        })
      ).toEqual('@rushstack/node-core-library');
      expect(
        configFileLoader.getPropertyOriginalValue({
          parentObject: loadedConfigFile.plugins[1],
          propertyName: 'plugin'
        })
      ).toEqual('@rushstack/heft');
      expect(
        configFileLoader.getPropertyOriginalValue({
          parentObject: loadedConfigFile.plugins[2],
          propertyName: 'plugin'
        })
      ).toEqual('jsonpath-plus');

      expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile.plugins[0])).toEqual(
        rootConfigFilePath
      );
      expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile.plugins[1])).toEqual(
        nodeJsPath.resolve(__dirname, secondConfigFilePath)
      );
      expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile.plugins[2])).toEqual(
        nodeJsPath.resolve(__dirname, secondConfigFilePath)
      );
    });

    it('Correctly loads a complex config file', () => {
      const projectRelativeFilePath: string = 'complexConfigFile/pluginsD.json';
      const rootConfigFilePath: string = nodeJsPath.resolve(__dirname, 'complexConfigFile', 'pluginsA.json');
      const secondConfigFilePath: string = nodeJsPath.resolve(
        __dirname,
        'complexConfigFile',
        'pluginsB.json'
      );
      const schemaPath: string = `${__dirname}/complexConfigFile/plugins.schema.json`;

      const configFileLoader: ProjectConfigurationFile<IComplexConfigFile> =
        new ProjectConfigurationFile<IComplexConfigFile>({
          projectRelativeFilePath: projectRelativeFilePath,
          jsonSchemaPath: schemaPath,
          jsonPathMetadata: {
            '$.plugins.*.plugin': {
              pathResolutionMethod: PathResolutionMethod.nodeResolve
            }
          }
        });
      const loadedConfigFile: IComplexConfigFile = configFileLoader.loadConfigurationFileForProject(
        terminal,
        __dirname
      );
      const expectedConfigFile: IComplexConfigFile = {
        plugins: [
          {
            plugin: FileSystem.getRealPath(
              nodeJsPath.resolve(
                projectRoot,
                'node_modules',
                '@rushstack',
                'node-core-library',
                'lib',
                'index.js'
              )
            )
          },
          {
            plugin: FileSystem.getRealPath(
              nodeJsPath.resolve(projectRoot, 'node_modules', '@rushstack', 'heft', 'lib', 'index.js')
            )
          },
          {
            plugin: FileSystem.getRealPath(
              nodeJsPath.resolve(projectRoot, 'node_modules', 'jsonpath-plus', 'dist', 'index-node-cjs.cjs')
            )
          }
        ]
      };

      expect(JSON.stringify(loadedConfigFile)).toEqual(JSON.stringify(expectedConfigFile));

      expect(
        configFileLoader.getPropertyOriginalValue({
          parentObject: loadedConfigFile.plugins[0],
          propertyName: 'plugin'
        })
      ).toEqual('@rushstack/node-core-library');
      expect(
        configFileLoader.getPropertyOriginalValue({
          parentObject: loadedConfigFile.plugins[1],
          propertyName: 'plugin'
        })
      ).toEqual('@rushstack/heft');
      expect(
        configFileLoader.getPropertyOriginalValue({
          parentObject: loadedConfigFile.plugins[2],
          propertyName: 'plugin'
        })
      ).toEqual('jsonpath-plus');

      expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile.plugins[0])).toEqual(
        rootConfigFilePath
      );
      expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile.plugins[1])).toEqual(
        nodeJsPath.resolve(__dirname, secondConfigFilePath)
      );
      expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile.plugins[2])).toEqual(
        nodeJsPath.resolve(__dirname, secondConfigFilePath)
      );
    });

    it('Correctly loads a complex config file async', async () => {
      const projectRelativeFilePath: string = 'complexConfigFile/pluginsD.json';
      const rootConfigFilePath: string = nodeJsPath.resolve(__dirname, 'complexConfigFile', 'pluginsA.json');
      const secondConfigFilePath: string = nodeJsPath.resolve(
        __dirname,
        'complexConfigFile',
        'pluginsB.json'
      );
      const schemaPath: string = `${__dirname}/complexConfigFile/plugins.schema.json`;

      const configFileLoader: ProjectConfigurationFile<IComplexConfigFile> =
        new ProjectConfigurationFile<IComplexConfigFile>({
          projectRelativeFilePath: projectRelativeFilePath,
          jsonSchemaPath: schemaPath,
          jsonPathMetadata: {
            '$.plugins.*.plugin': {
              pathResolutionMethod: PathResolutionMethod.nodeResolve
            }
          }
        });
      const loadedConfigFile: IComplexConfigFile =
        await configFileLoader.loadConfigurationFileForProjectAsync(terminal, __dirname);
      const expectedConfigFile: IComplexConfigFile = {
        plugins: [
          {
            plugin: await FileSystem.getRealPathAsync(
              nodeJsPath.resolve(
                projectRoot,
                'node_modules',
                '@rushstack',
                'node-core-library',
                'lib',
                'index.js'
              )
            )
          },
          {
            plugin: await FileSystem.getRealPathAsync(
              nodeJsPath.resolve(projectRoot, 'node_modules', '@rushstack', 'heft', 'lib', 'index.js')
            )
          },
          {
            plugin: await FileSystem.getRealPathAsync(
              nodeJsPath.resolve(projectRoot, 'node_modules', 'jsonpath-plus', 'dist', 'index-node-cjs.cjs')
            )
          }
        ]
      };

      expect(JSON.stringify(loadedConfigFile)).toEqual(JSON.stringify(expectedConfigFile));

      expect(
        configFileLoader.getPropertyOriginalValue({
          parentObject: loadedConfigFile.plugins[0],
          propertyName: 'plugin'
        })
      ).toEqual('@rushstack/node-core-library');
      expect(
        configFileLoader.getPropertyOriginalValue({
          parentObject: loadedConfigFile.plugins[1],
          propertyName: 'plugin'
        })
      ).toEqual('@rushstack/heft');
      expect(
        configFileLoader.getPropertyOriginalValue({
          parentObject: loadedConfigFile.plugins[2],
          propertyName: 'plugin'
        })
      ).toEqual('jsonpath-plus');

      expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile.plugins[0])).toEqual(
        rootConfigFilePath
      );
      expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile.plugins[1])).toEqual(
        nodeJsPath.resolve(__dirname, secondConfigFilePath)
      );
      expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile.plugins[2])).toEqual(
        nodeJsPath.resolve(__dirname, secondConfigFilePath)
      );
    });

    it('Can get the original $schema property value', async () => {
      async function testForFilename(filename: string, expectedSchema: string): Promise<void> {
        const projectRelativeFilePath: string = `complexConfigFile/${filename}`;
        const jsonSchemaPath: string = nodeJsPath.resolve(
          __dirname,
          'complexConfigFile',
          'plugins.schema.json'
        );

        const configFileLoader: ProjectConfigurationFile<IComplexConfigFile> =
          new ProjectConfigurationFile<IComplexConfigFile>({
            projectRelativeFilePath,
            jsonSchemaPath
          });
        const loadedConfigFile: IComplexConfigFile =
          await configFileLoader.loadConfigurationFileForProjectAsync(terminal, __dirname);
        expect(configFileLoader.getSchemaPropertyOriginalValue(loadedConfigFile)).toEqual(expectedSchema);
      }

      await testForFilename('pluginsA.json', 'http://schema.net/A');
      await testForFilename('pluginsB.json', 'http://schema.net/B');
      await testForFilename('pluginsC.json', 'http://schema.net/C');
      await testForFilename('pluginsD.json', 'http://schema.net/D');
    });
  });

  describe('a complex file with inheritance type annotations', () => {
    interface IInheritanceTypeConfigFile {
      a: string;
      b: { c: string }[];
      d: {
        e: string;
        f: string;
        g: { h: string }[];
        i: { j: string }[];
        k: {
          l: string;
          m: { n: string }[];
          z?: string;
        };
        o: {
          p: { q: string }[];
        };
        r: {
          s: string;
        };
        y?: {
          z: string;
        };
      };
      y?: {
        z: string;
      };
    }

    interface ISimpleInheritanceTypeConfigFile {
      a: { b: string }[];
      c: {
        d: { e: string }[];
      };
      f: {
        g: { h: string }[];
        i: {
          j: { k: string }[];
        };
      };
      l: string;
    }

    it('Correctly loads a complex config file with inheritance type annotations', () => {
      const projectRelativeFilePath: string = 'inheritanceTypeConfigFile/inheritanceTypeConfigFileB.json';
      const rootConfigFilePath: string = nodeJsPath.resolve(
        __dirname,
        'inheritanceTypeConfigFile',
        'inheritanceTypeConfigFileA.json'
      );
      const secondConfigFilePath: string = nodeJsPath.resolve(
        __dirname,
        'inheritanceTypeConfigFile',
        'inheritanceTypeConfigFileB.json'
      );
      const schemaPath: string = `${__dirname}/inheritanceTypeConfigFile/inheritanceTypeConfigFile.schema.json`;

      const configFileLoader: ProjectConfigurationFile<IInheritanceTypeConfigFile> =
        new ProjectConfigurationFile<IInheritanceTypeConfigFile>({
          projectRelativeFilePath: projectRelativeFilePath,
          jsonSchemaPath: schemaPath
        });
      const loadedConfigFile: IInheritanceTypeConfigFile = configFileLoader.loadConfigurationFileForProject(
        terminal,
        __dirname
      );
      const expectedConfigFile: IInheritanceTypeConfigFile = {
        a: 'A',
        // "$b.inheritanceType": "append"
        b: [{ c: 'A' }, { c: 'B' }],
        // "$d.inheritanceType": "merge"
        d: {
          e: 'A',
          f: 'B',
          // "$g.inheritanceType": "append"
          g: [{ h: 'A' }, { h: 'B' }],
          // "$i.inheritanceType": "replace"
          i: [{ j: 'B' }],
          // "$k.inheritanceType": "merge"
          k: {
            l: 'A',
            m: [{ n: 'A' }, { n: 'B' }],
            z: 'B'
          },
          // "$o.inheritanceType": "replace"
          o: {
            p: [{ q: 'B' }]
          },
          r: {
            s: 'A'
          },
          y: {
            z: 'B'
          }
        },
        y: {
          z: 'B'
        }
      };

      expect(JSON.stringify(loadedConfigFile)).toEqual(JSON.stringify(expectedConfigFile));

      expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile.b[0])).toEqual(rootConfigFilePath);
      expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile.b[1])).toEqual(secondConfigFilePath);

      // loadedConfigFile.d source path is the second config file since it was merged into the first
      expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile.d)).toEqual(secondConfigFilePath);
      expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile.d.g[0])).toEqual(rootConfigFilePath);
      expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile.d.g[1])).toEqual(secondConfigFilePath);
      expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile.d.i[0])).toEqual(secondConfigFilePath);

      // loadedConfigFile.d.k source path is the second config file since it was merged into the first
      expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile.d.k)).toEqual(secondConfigFilePath);
      expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile.d.k.m[0])).toEqual(rootConfigFilePath);
      expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile.d.k.m[1])).toEqual(
        secondConfigFilePath
      );

      // loadedConfigFile.d.o source path is the second config file since it replaced the first
      expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile.d.o)).toEqual(secondConfigFilePath);
      expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile.d.o.p[0])).toEqual(
        secondConfigFilePath
      );

      expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile.d.r)).toEqual(rootConfigFilePath);

      expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile.d.y!)).toEqual(secondConfigFilePath);

      expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile.y!)).toEqual(secondConfigFilePath);
    });

    it('Correctly loads a complex config file with inheritance type annotations async', async () => {
      const projectRelativeFilePath: string = 'inheritanceTypeConfigFile/inheritanceTypeConfigFileB.json';
      const rootConfigFilePath: string = nodeJsPath.resolve(
        __dirname,
        'inheritanceTypeConfigFile',
        'inheritanceTypeConfigFileA.json'
      );
      const secondConfigFilePath: string = nodeJsPath.resolve(
        __dirname,
        'inheritanceTypeConfigFile',
        'inheritanceTypeConfigFileB.json'
      );
      const schemaPath: string = `${__dirname}/inheritanceTypeConfigFile/inheritanceTypeConfigFile.schema.json`;

      const configFileLoader: ProjectConfigurationFile<IInheritanceTypeConfigFile> =
        new ProjectConfigurationFile<IInheritanceTypeConfigFile>({
          projectRelativeFilePath: projectRelativeFilePath,
          jsonSchemaPath: schemaPath
        });
      const loadedConfigFile: IInheritanceTypeConfigFile =
        await configFileLoader.loadConfigurationFileForProjectAsync(terminal, __dirname);
      const expectedConfigFile: IInheritanceTypeConfigFile = {
        a: 'A',
        // "$b.inheritanceType": "append"
        b: [{ c: 'A' }, { c: 'B' }],
        // "$d.inheritanceType": "merge"
        d: {
          e: 'A',
          f: 'B',
          // "$g.inheritanceType": "append"
          g: [{ h: 'A' }, { h: 'B' }],
          // "$i.inheritanceType": "replace"
          i: [{ j: 'B' }],
          // "$k.inheritanceType": "merge"
          k: {
            l: 'A',
            m: [{ n: 'A' }, { n: 'B' }],
            z: 'B'
          },
          // "$o.inheritanceType": "replace"
          o: {
            p: [{ q: 'B' }]
          },
          r: {
            s: 'A'
          },
          y: {
            z: 'B'
          }
        },
        y: {
          z: 'B'
        }
      };

      expect(JSON.stringify(loadedConfigFile)).toEqual(JSON.stringify(expectedConfigFile));

      expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile.b[0])).toEqual(rootConfigFilePath);
      expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile.b[1])).toEqual(secondConfigFilePath);

      // loadedConfigFile.d source path is the second config file since it was merged into the first
      expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile.d)).toEqual(secondConfigFilePath);
      expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile.d.g[0])).toEqual(rootConfigFilePath);
      expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile.d.g[1])).toEqual(secondConfigFilePath);
      expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile.d.i[0])).toEqual(secondConfigFilePath);

      // loadedConfigFile.d.k source path is the second config file since it was merged into the first
      expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile.d.k)).toEqual(secondConfigFilePath);
      expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile.d.k.m[0])).toEqual(rootConfigFilePath);
      expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile.d.k.m[1])).toEqual(
        secondConfigFilePath
      );

      // loadedConfigFile.d.o source path is the second config file since it replaced the first
      expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile.d.o)).toEqual(secondConfigFilePath);
      expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile.d.o.p[0])).toEqual(
        secondConfigFilePath
      );

      expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile.d.r)).toEqual(rootConfigFilePath);

      expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile.d.y!)).toEqual(secondConfigFilePath);

      expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile.y!)).toEqual(secondConfigFilePath);
    });

    it('Correctly loads a complex config file with a single inheritance type annotation', async () => {
      const projectRelativeFilePath: string =
        'simpleInheritanceTypeConfigFile/simpleInheritanceTypeConfigFileB.json';
      const rootConfigFilePath: string = nodeJsPath.resolve(
        __dirname,
        'simpleInheritanceTypeConfigFile',
        'simpleInheritanceTypeConfigFileA.json'
      );
      const secondConfigFilePath: string = nodeJsPath.resolve(
        __dirname,
        'simpleInheritanceTypeConfigFile',
        'simpleInheritanceTypeConfigFileB.json'
      );
      const schemaPath: string = `${__dirname}/simpleInheritanceTypeConfigFile/simpleInheritanceTypeConfigFile.schema.json`;

      const configFileLoader: ProjectConfigurationFile<ISimpleInheritanceTypeConfigFile> =
        new ProjectConfigurationFile<ISimpleInheritanceTypeConfigFile>({
          projectRelativeFilePath: projectRelativeFilePath,
          jsonSchemaPath: schemaPath
        });
      const loadedConfigFile: ISimpleInheritanceTypeConfigFile =
        await configFileLoader.loadConfigurationFileForProjectAsync(terminal, __dirname);
      const expectedConfigFile: ISimpleInheritanceTypeConfigFile = {
        a: [{ b: 'A' }, { b: 'B' }],
        c: {
          d: [{ e: 'B' }]
        },
        // "$f.inheritanceType": "merge"
        f: {
          g: [{ h: 'A' }, { h: 'B' }],
          i: {
            j: [{ k: 'B' }]
          }
        },
        l: 'A'
      };

      expect(JSON.stringify(loadedConfigFile)).toEqual(JSON.stringify(expectedConfigFile));

      expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile.a[0])).toEqual(rootConfigFilePath);
      expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile.a[1])).toEqual(secondConfigFilePath);

      expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile.c)).toEqual(secondConfigFilePath);
      expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile.c.d[0])).toEqual(secondConfigFilePath);

      // loadedConfigFile.f source path is the second config file since it was merged into the first
      expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile.f)).toEqual(secondConfigFilePath);
      expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile.f.g[0])).toEqual(rootConfigFilePath);
      expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile.f.g[1])).toEqual(secondConfigFilePath);
      expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile.f.i)).toEqual(secondConfigFilePath);
      expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile.f.i.j[0])).toEqual(
        secondConfigFilePath
      );
    });

    it("throws an error when an array uses the 'merge' inheritance type", () => {
      const schemaPath: string = `${__dirname}/simpleInheritanceTypeConfigFile/simpleInheritanceTypeConfigFile.schema.json`;
      const configFileLoader: ProjectConfigurationFile<void> = new ProjectConfigurationFile({
        projectRelativeFilePath: 'simpleInheritanceTypeConfigFile/badInheritanceTypeConfigFileA.json',
        jsonSchemaPath: schemaPath
      });

      expect(() =>
        configFileLoader.loadConfigurationFileForProject(terminal, __dirname)
      ).toThrowErrorMatchingSnapshot();
    });

    it("throws an error when an array uses the 'merge' inheritance type async", async () => {
      const schemaPath: string = `${__dirname}/simpleInheritanceTypeConfigFile/simpleInheritanceTypeConfigFile.schema.json`;
      const configFileLoader: ProjectConfigurationFile<void> = new ProjectConfigurationFile({
        projectRelativeFilePath: 'simpleInheritanceTypeConfigFile/badInheritanceTypeConfigFileA.json',
        jsonSchemaPath: schemaPath
      });

      await expect(
        configFileLoader.loadConfigurationFileForProjectAsync(terminal, __dirname)
      ).rejects.toThrowErrorMatchingSnapshot();
    });

    it("throws an error when a keyed object uses the 'append' inheritance type", () => {
      const schemaPath: string = `${__dirname}/simpleInheritanceTypeConfigFile/simpleInheritanceTypeConfigFile.schema.json`;
      const configFileLoader: ProjectConfigurationFile<void> = new ProjectConfigurationFile({
        projectRelativeFilePath: 'simpleInheritanceTypeConfigFile/badInheritanceTypeConfigFileB.json',
        jsonSchemaPath: schemaPath
      });

      expect(() =>
        configFileLoader.loadConfigurationFileForProject(terminal, __dirname)
      ).toThrowErrorMatchingSnapshot();
    });

    it("throws an error when a keyed object uses the 'append' inheritance type async", async () => {
      const schemaPath: string = `${__dirname}/simpleInheritanceTypeConfigFile/simpleInheritanceTypeConfigFile.schema.json`;
      const configFileLoader: ProjectConfigurationFile<void> = new ProjectConfigurationFile({
        projectRelativeFilePath: 'simpleInheritanceTypeConfigFile/badInheritanceTypeConfigFileB.json',
        jsonSchemaPath: schemaPath
      });

      await expect(
        configFileLoader.loadConfigurationFileForProjectAsync(terminal, __dirname)
      ).rejects.toThrowErrorMatchingSnapshot();
    });

    it('throws an error when a non-object property uses an inheritance type', () => {
      const schemaPath: string = `${__dirname}/simpleInheritanceTypeConfigFile/simpleInheritanceTypeConfigFile.schema.json`;
      const configFileLoader: ProjectConfigurationFile<void> = new ProjectConfigurationFile({
        projectRelativeFilePath: 'simpleInheritanceTypeConfigFile/badInheritanceTypeConfigFileC.json',
        jsonSchemaPath: schemaPath
      });

      expect(() =>
        configFileLoader.loadConfigurationFileForProject(terminal, __dirname)
      ).toThrowErrorMatchingSnapshot();
    });

    it('throws an error when a non-object property uses an inheritance type async', async () => {
      const schemaPath: string = `${__dirname}/simpleInheritanceTypeConfigFile/simpleInheritanceTypeConfigFile.schema.json`;
      const configFileLoader: ProjectConfigurationFile<void> = new ProjectConfigurationFile({
        projectRelativeFilePath: 'simpleInheritanceTypeConfigFile/badInheritanceTypeConfigFileC.json',
        jsonSchemaPath: schemaPath
      });

      await expect(
        configFileLoader.loadConfigurationFileForProjectAsync(terminal, __dirname)
      ).rejects.toThrowErrorMatchingSnapshot();
    });

    it('throws an error when an inheritance type is specified for an unspecified property', () => {
      const schemaPath: string = `${__dirname}/simpleInheritanceTypeConfigFile/simpleInheritanceTypeConfigFile.schema.json`;
      const configFileLoader: ProjectConfigurationFile<void> = new ProjectConfigurationFile({
        projectRelativeFilePath: 'simpleInheritanceTypeConfigFile/badInheritanceTypeConfigFileD.json',
        jsonSchemaPath: schemaPath
      });

      expect(() =>
        configFileLoader.loadConfigurationFileForProject(terminal, __dirname)
      ).toThrowErrorMatchingSnapshot();
    });

    it('throws an error when an inheritance type is specified for an unspecified property async', async () => {
      const schemaPath: string = `${__dirname}/simpleInheritanceTypeConfigFile/simpleInheritanceTypeConfigFile.schema.json`;
      const configFileLoader: ProjectConfigurationFile<void> = new ProjectConfigurationFile({
        projectRelativeFilePath: 'simpleInheritanceTypeConfigFile/badInheritanceTypeConfigFileD.json',
        jsonSchemaPath: schemaPath
      });

      await expect(
        configFileLoader.loadConfigurationFileForProjectAsync(terminal, __dirname)
      ).rejects.toThrowErrorMatchingSnapshot();
    });

    it('throws an error when an unsupported inheritance type is specified', () => {
      const schemaPath: string = `${__dirname}/simpleInheritanceTypeConfigFile/simpleInheritanceTypeConfigFile.schema.json`;
      const configFileLoader: ProjectConfigurationFile<void> = new ProjectConfigurationFile({
        projectRelativeFilePath: 'simpleInheritanceTypeConfigFile/badInheritanceTypeConfigFileE.json',
        jsonSchemaPath: schemaPath
      });

      expect(() =>
        configFileLoader.loadConfigurationFileForProject(terminal, __dirname)
      ).toThrowErrorMatchingSnapshot();
    });

    it('throws an error when an unsupported inheritance type is specified async', async () => {
      const schemaPath: string = `${__dirname}/simpleInheritanceTypeConfigFile/simpleInheritanceTypeConfigFile.schema.json`;
      const configFileLoader: ProjectConfigurationFile<void> = new ProjectConfigurationFile({
        projectRelativeFilePath: 'simpleInheritanceTypeConfigFile/badInheritanceTypeConfigFileE.json',
        jsonSchemaPath: schemaPath
      });

      await expect(
        configFileLoader.loadConfigurationFileForProjectAsync(terminal, __dirname)
      ).rejects.toThrowErrorMatchingSnapshot();
    });
  });

  describe('loading a rig', () => {
    const projectFolder: string = `${__dirname}/project-referencing-rig`;
    const rigConfig: RigConfig = RigConfig.loadForProjectFolder({ projectFolderPath: projectFolder });

    const schemaPath: string = `${__dirname}/simplestConfigFile/simplestConfigFile.schema.json`;

    interface ISimplestConfigFile {
      thing: string;
    }

    it('correctly loads a config file inside a rig', () => {
      const projectRelativeFilePath: string = 'config/simplestConfigFile.json';
      const configFileLoader: ProjectConfigurationFile<ISimplestConfigFile> =
        new ProjectConfigurationFile<ISimplestConfigFile>({
          projectRelativeFilePath: projectRelativeFilePath,
          jsonSchemaPath: schemaPath
        });
      const loadedConfigFile: ISimplestConfigFile = configFileLoader.loadConfigurationFileForProject(
        terminal,
        projectFolder,
        rigConfig
      );
      const expectedConfigFile: ISimplestConfigFile = { thing: 'A' };

      expect(JSON.stringify(loadedConfigFile)).toEqual(JSON.stringify(expectedConfigFile));
      expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile)).toEqual(
        nodeJsPath.resolve(
          projectFolder,
          'node_modules',
          'test-rig',
          'profiles',
          'default',
          projectRelativeFilePath
        )
      );
      expect(
        configFileLoader.getPropertyOriginalValue({ parentObject: loadedConfigFile, propertyName: 'thing' })
      ).toEqual('A');
    });

    it('correctly loads a config file inside a rig async', async () => {
      const projectRelativeFilePath: string = 'config/simplestConfigFile.json';
      const configFileLoader: ProjectConfigurationFile<ISimplestConfigFile> =
        new ProjectConfigurationFile<ISimplestConfigFile>({
          projectRelativeFilePath: projectRelativeFilePath,
          jsonSchemaPath: schemaPath
        });
      const loadedConfigFile: ISimplestConfigFile =
        await configFileLoader.loadConfigurationFileForProjectAsync(terminal, projectFolder, rigConfig);
      const expectedConfigFile: ISimplestConfigFile = { thing: 'A' };

      expect(JSON.stringify(loadedConfigFile)).toEqual(JSON.stringify(expectedConfigFile));
      expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile)).toEqual(
        nodeJsPath.resolve(
          projectFolder,
          'node_modules',
          'test-rig',
          'profiles',
          'default',
          projectRelativeFilePath
        )
      );
      expect(
        configFileLoader.getPropertyOriginalValue({ parentObject: loadedConfigFile, propertyName: 'thing' })
      ).toEqual('A');
    });

    it('correctly loads a config file inside a rig via tryLoadConfigurationFileForProject', () => {
      const projectRelativeFilePath: string = 'config/simplestConfigFile.json';
      const configFileLoader: ProjectConfigurationFile<ISimplestConfigFile> =
        new ProjectConfigurationFile<ISimplestConfigFile>({
          projectRelativeFilePath: projectRelativeFilePath,
          jsonSchemaPath: schemaPath
        });
      const loadedConfigFile: ISimplestConfigFile | undefined =
        configFileLoader.tryLoadConfigurationFileForProject(terminal, projectFolder, rigConfig);
      const expectedConfigFile: ISimplestConfigFile = { thing: 'A' };

      expect(loadedConfigFile).not.toBeUndefined();
      expect(JSON.stringify(loadedConfigFile)).toEqual(JSON.stringify(expectedConfigFile));
      expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile!)).toEqual(
        nodeJsPath.resolve(
          projectFolder,
          'node_modules',
          'test-rig',
          'profiles',
          'default',
          projectRelativeFilePath
        )
      );
      expect(
        configFileLoader.getPropertyOriginalValue({ parentObject: loadedConfigFile!, propertyName: 'thing' })
      ).toEqual('A');
    });

    it('correctly loads a config file inside a rig via tryLoadConfigurationFileForProjectAsync', async () => {
      const projectRelativeFilePath: string = 'config/simplestConfigFile.json';
      const configFileLoader: ProjectConfigurationFile<ISimplestConfigFile> =
        new ProjectConfigurationFile<ISimplestConfigFile>({
          projectRelativeFilePath: projectRelativeFilePath,
          jsonSchemaPath: schemaPath
        });
      const loadedConfigFile: ISimplestConfigFile | undefined =
        await configFileLoader.tryLoadConfigurationFileForProjectAsync(terminal, projectFolder, rigConfig);
      const expectedConfigFile: ISimplestConfigFile = { thing: 'A' };

      expect(loadedConfigFile).not.toBeUndefined();
      expect(JSON.stringify(loadedConfigFile)).toEqual(JSON.stringify(expectedConfigFile));
      expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile!)).toEqual(
        nodeJsPath.resolve(
          projectFolder,
          'node_modules',
          'test-rig',
          'profiles',
          'default',
          projectRelativeFilePath
        )
      );
      expect(
        configFileLoader.getPropertyOriginalValue({ parentObject: loadedConfigFile!, propertyName: 'thing' })
      ).toEqual('A');
    });

    it("throws an error when a config file doesn't exist in a project referencing a rig, which also doesn't have the file", () => {
      const configFileLoader: ProjectConfigurationFile<void> = new ProjectConfigurationFile({
        projectRelativeFilePath: 'config/notExist.json',
        jsonSchemaPath: schemaPath
      });

      expect(() =>
        configFileLoader.loadConfigurationFileForProject(terminal, projectFolder, rigConfig)
      ).toThrowErrorMatchingSnapshot();
    });

    it("throws an error when a config file doesn't exist in a project referencing a rig, which also doesn't have the file async", async () => {
      const configFileLoader: ProjectConfigurationFile<void> = new ProjectConfigurationFile({
        projectRelativeFilePath: 'config/notExist.json',
        jsonSchemaPath: schemaPath
      });

      await expect(
        configFileLoader.loadConfigurationFileForProjectAsync(terminal, projectFolder, rigConfig)
      ).rejects.toThrowErrorMatchingSnapshot();
    });
  });

  describe('error cases', () => {
    const errorCasesFolderName: string = 'errorCases';

    it("throws an error when the file doesn't exist", () => {
      const errorCaseFolderName: string = 'invalidType';
      const configFileLoader: ProjectConfigurationFile<void> = new ProjectConfigurationFile({
        projectRelativeFilePath: `${errorCasesFolderName}/${errorCaseFolderName}/notExist.json`,
        jsonSchemaPath: `${__dirname}/${errorCasesFolderName}/${errorCaseFolderName}/config.schema.json`
      });

      expect(() =>
        configFileLoader.loadConfigurationFileForProject(terminal, __dirname)
      ).toThrowErrorMatchingSnapshot();
    });

    it("throws an error when the file doesn't exist async", async () => {
      const errorCaseFolderName: string = 'invalidType';
      const configFileLoader: ProjectConfigurationFile<void> = new ProjectConfigurationFile({
        projectRelativeFilePath: `${errorCasesFolderName}/${errorCaseFolderName}/notExist.json`,
        jsonSchemaPath: `${__dirname}/${errorCasesFolderName}/${errorCaseFolderName}/config.schema.json`
      });

      await expect(
        configFileLoader.loadConfigurationFileForProjectAsync(terminal, __dirname)
      ).rejects.toThrowErrorMatchingSnapshot();
    });

    it("returns undefined when the file doesn't exist for tryLoadConfigurationFileForProject", () => {
      const errorCaseFolderName: string = 'invalidType';
      const configFileLoader: ProjectConfigurationFile<void> = new ProjectConfigurationFile({
        projectRelativeFilePath: `${errorCasesFolderName}/${errorCaseFolderName}/notExist.json`,
        jsonSchemaPath: `${__dirname}/${errorCasesFolderName}/${errorCaseFolderName}/config.schema.json`
      });

      expect(configFileLoader.tryLoadConfigurationFileForProject(terminal, __dirname)).toBeUndefined();
    });

    it("returns undefined when the file doesn't exist for tryLoadConfigurationFileForProjectAsync", async () => {
      const errorCaseFolderName: string = 'invalidType';
      const configFileLoader: ProjectConfigurationFile<void> = new ProjectConfigurationFile({
        projectRelativeFilePath: `${errorCasesFolderName}/${errorCaseFolderName}/notExist.json`,
        jsonSchemaPath: `${__dirname}/${errorCasesFolderName}/${errorCaseFolderName}/config.schema.json`
      });

      await expect(
        configFileLoader.tryLoadConfigurationFileForProjectAsync(terminal, __dirname)
      ).resolves.toBeUndefined();
    });

    it("Throws an error when the file isn't valid JSON", () => {
      const errorCaseFolderName: string = 'invalidJson';
      const configFilePath: string = `${errorCasesFolderName}/${errorCaseFolderName}/config.json`;
      const fullConfigFilePath: string = `${__dirname}/${configFilePath}`;
      // Normalize newlines to make the error message consistent across platforms
      const normalizedRawConfigFile: string = Text.convertToLf(FileSystem.readFile(fullConfigFilePath));
      jest
        .spyOn(FileSystem, 'readFileAsync')
        .mockImplementation((filePath: string) =>
          Path.convertToSlashes(filePath) === Path.convertToSlashes(fullConfigFilePath)
            ? Promise.resolve(normalizedRawConfigFile)
            : Promise.reject(new Error('File not found'))
        );

      const configFileLoader: ProjectConfigurationFile<void> = new ProjectConfigurationFile({
        projectRelativeFilePath: configFilePath,
        jsonSchemaPath: `${__dirname}/${errorCasesFolderName}/${errorCaseFolderName}/config.schema.json`
      });

      // The synchronous code path on Windows somehow determines that the unexpected character is
      // a newline on Windows, and a curly brace on other platforms, even though the location is
      // accurate in both cases. Use a regex to match either.
      expect(() => configFileLoader.loadConfigurationFileForProject(terminal, __dirname)).toThrowError(
        /In configuration file "<project root>\/lib\/test\/errorCases\/invalidJson\/config.json": SyntaxError: Unexpected token '(}|\\n)' at 2:19/
      );

      jest.restoreAllMocks();
    });

    it("Throws an error when the file isn't valid JSON async", async () => {
      const errorCaseFolderName: string = 'invalidJson';
      const configFilePath: string = `${errorCasesFolderName}/${errorCaseFolderName}/config.json`;
      const fullConfigFilePath: string = `${__dirname}/${configFilePath}`;
      // Normalize newlines to make the error message consistent across platforms
      const normalizedRawConfigFile: string = Text.convertToLf(
        await FileSystem.readFileAsync(fullConfigFilePath)
      );
      jest
        .spyOn(FileSystem, 'readFileAsync')
        .mockImplementation((filePath: string) =>
          Path.convertToSlashes(filePath) === Path.convertToSlashes(fullConfigFilePath)
            ? Promise.resolve(normalizedRawConfigFile)
            : Promise.reject(new Error('File not found'))
        );

      const configFileLoader: ProjectConfigurationFile<void> = new ProjectConfigurationFile({
        projectRelativeFilePath: configFilePath,
        jsonSchemaPath: `${__dirname}/${errorCasesFolderName}/${errorCaseFolderName}/config.schema.json`
      });

      await expect(
        configFileLoader.loadConfigurationFileForProjectAsync(terminal, __dirname)
      ).rejects.toThrowError(
        /In configuration file "<project root>\/lib\/test\/errorCases\/invalidJson\/config.json": SyntaxError: Unexpected token '(}|\\n)' at 2:19/
      );

      jest.restoreAllMocks();
    });

    it("Throws an error for a file that doesn't match its schema", () => {
      const errorCaseFolderName: string = 'invalidType';
      const configFileLoader: ProjectConfigurationFile<void> = new ProjectConfigurationFile({
        projectRelativeFilePath: `${errorCasesFolderName}/${errorCaseFolderName}/config.json`,
        jsonSchemaPath: `${__dirname}/${errorCasesFolderName}/${errorCaseFolderName}/config.schema.json`
      });

      expect(() =>
        configFileLoader.loadConfigurationFileForProject(terminal, __dirname)
      ).toThrowErrorMatchingSnapshot();
    });

    it("Throws an error for a file that doesn't match its schema async", async () => {
      const errorCaseFolderName: string = 'invalidType';
      const configFileLoader: ProjectConfigurationFile<void> = new ProjectConfigurationFile({
        projectRelativeFilePath: `${errorCasesFolderName}/${errorCaseFolderName}/config.json`,
        jsonSchemaPath: `${__dirname}/${errorCasesFolderName}/${errorCaseFolderName}/config.schema.json`
      });

      await expect(
        configFileLoader.loadConfigurationFileForProjectAsync(terminal, __dirname)
      ).rejects.toThrowErrorMatchingSnapshot();
    });

    it('Throws an error when there is a circular reference in "extends" properties', () => {
      const errorCaseFolderName: string = 'circularReference';
      const configFileLoader: ProjectConfigurationFile<void> = new ProjectConfigurationFile({
        projectRelativeFilePath: `${errorCasesFolderName}/${errorCaseFolderName}/config1.json`,
        jsonSchemaPath: `${__dirname}/${errorCasesFolderName}/${errorCaseFolderName}/config.schema.json`
      });

      expect(() =>
        configFileLoader.loadConfigurationFileForProject(terminal, __dirname)
      ).toThrowErrorMatchingSnapshot();
    });

    it('Throws an error when there is a circular reference in "extends" properties async', async () => {
      const errorCaseFolderName: string = 'circularReference';
      const configFileLoader: ProjectConfigurationFile<void> = new ProjectConfigurationFile({
        projectRelativeFilePath: `${errorCasesFolderName}/${errorCaseFolderName}/config1.json`,
        jsonSchemaPath: `${__dirname}/${errorCasesFolderName}/${errorCaseFolderName}/config.schema.json`
      });

      await expect(
        configFileLoader.loadConfigurationFileForProjectAsync(terminal, __dirname)
      ).rejects.toThrowErrorMatchingSnapshot();
    });

    it('Throws an error when an "extends" property points to a file that cannot be resolved', () => {
      const errorCaseFolderName: string = 'extendsNotExist';
      const configFileLoader: ProjectConfigurationFile<void> = new ProjectConfigurationFile({
        projectRelativeFilePath: `${errorCasesFolderName}/${errorCaseFolderName}/config.json`,
        jsonSchemaPath: `${__dirname}/${errorCasesFolderName}/${errorCaseFolderName}/config.schema.json`
      });

      expect(() =>
        configFileLoader.loadConfigurationFileForProject(terminal, __dirname)
      ).toThrowErrorMatchingSnapshot();
    });

    it('Throws an error when an "extends" property points to a file that cannot be resolved async', async () => {
      const errorCaseFolderName: string = 'extendsNotExist';
      const configFileLoader: ProjectConfigurationFile<void> = new ProjectConfigurationFile({
        projectRelativeFilePath: `${errorCasesFolderName}/${errorCaseFolderName}/config.json`,
        jsonSchemaPath: `${__dirname}/${errorCasesFolderName}/${errorCaseFolderName}/config.schema.json`
      });

      await expect(
        configFileLoader.loadConfigurationFileForProjectAsync(terminal, __dirname)
      ).rejects.toThrowErrorMatchingSnapshot();
    });

    it("Throws an error when a combined config file doesn't match the schema", () => {
      const errorCaseFolderName: string = 'invalidCombinedFile';
      const configFileLoader: ProjectConfigurationFile<void> = new ProjectConfigurationFile({
        projectRelativeFilePath: `${errorCasesFolderName}/${errorCaseFolderName}/config1.json`,
        jsonSchemaPath: `${__dirname}/${errorCasesFolderName}/${errorCaseFolderName}/config.schema.json`
      });

      expect(() =>
        configFileLoader.loadConfigurationFileForProject(terminal, __dirname)
      ).toThrowErrorMatchingSnapshot();
    });

    it("Throws an error when a combined config file doesn't match the schema async", async () => {
      const errorCaseFolderName: string = 'invalidCombinedFile';
      const configFileLoader: ProjectConfigurationFile<void> = new ProjectConfigurationFile({
        projectRelativeFilePath: `${errorCasesFolderName}/${errorCaseFolderName}/config1.json`,
        jsonSchemaPath: `${__dirname}/${errorCasesFolderName}/${errorCaseFolderName}/config.schema.json`
      });

      await expect(
        configFileLoader.loadConfigurationFileForProjectAsync(terminal, __dirname)
      ).rejects.toThrowErrorMatchingSnapshot();
    });

    it("Throws an error when a requested file doesn't exist", () => {
      const configFileLoader: ProjectConfigurationFile<void> = new ProjectConfigurationFile({
        projectRelativeFilePath: `${errorCasesFolderName}/folderThatDoesntExist/config.json`,
        jsonSchemaPath: `${__dirname}/${errorCasesFolderName}/invalidCombinedFile/config.schema.json`
      });

      expect(() =>
        configFileLoader.loadConfigurationFileForProject(terminal, __dirname)
      ).toThrowErrorMatchingSnapshot();
    });

    it("Throws an error when a requested file doesn't exist async", async () => {
      const configFileLoader: ProjectConfigurationFile<void> = new ProjectConfigurationFile({
        projectRelativeFilePath: `${errorCasesFolderName}/folderThatDoesntExist/config.json`,
        jsonSchemaPath: `${__dirname}/${errorCasesFolderName}/invalidCombinedFile/config.schema.json`
      });

      await expect(
        configFileLoader.loadConfigurationFileForProjectAsync(terminal, __dirname)
      ).rejects.toThrowErrorMatchingSnapshot();
    });
  });
});
