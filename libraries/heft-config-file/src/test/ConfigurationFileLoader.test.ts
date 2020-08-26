// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as nodeJsPath from 'path';

import { ConfigurationFileLoader, PathResolutionMethod, InheritanceType } from '../ConfigurationFileLoader';
import { FileSystem, JsonFile } from '@rushstack/node-core-library';

describe('ConfigLoader', () => {
  const projectRoot: string = nodeJsPath.resolve(__dirname, '..', '..');

  describe('A simple config file', () => {
    const configFileFolder: string = nodeJsPath.resolve(__dirname, 'simplestConfigFile');
    const configFilePath: string = nodeJsPath.resolve(configFileFolder, 'simplestConfigFile.json');
    const schemaPath: string = nodeJsPath.resolve(configFileFolder, 'simplestConfigFile.schema.json');

    interface ISimplestConfigFile {
      thing: string;
    }

    it('Correctly loads the config file', async () => {
      const configFileLoader: ConfigurationFileLoader<ISimplestConfigFile> = new ConfigurationFileLoader<
        ISimplestConfigFile
      >(schemaPath);
      const loadedConfigFile: ISimplestConfigFile = await configFileLoader.loadConfigurationFileAsync(
        configFilePath
      );
      const expectedConfigFile: ISimplestConfigFile = { thing: 'A' };

      expect(JSON.stringify(loadedConfigFile)).toEqual(JSON.stringify(expectedConfigFile));
      expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile)).toEqual(configFilePath);
      expect(
        configFileLoader.getPropertyOriginalValue({ parentObject: loadedConfigFile, propertyName: 'thing' })
      ).toEqual('A');
    });

    it('Correctly resolves paths relative to the config file', async () => {
      const configFileLoader: ConfigurationFileLoader<ISimplestConfigFile> = new ConfigurationFileLoader<
        ISimplestConfigFile
      >(schemaPath, {
        jsonPathMetadata: {
          '$.thing': {
            pathResolutionMethod: PathResolutionMethod.resolvePathRelativeToConfigurationFile
          }
        }
      });
      const loadedConfigFile: ISimplestConfigFile = await configFileLoader.loadConfigurationFileAsync(
        configFilePath
      );
      const expectedConfigFile: ISimplestConfigFile = {
        thing: nodeJsPath.resolve(configFileFolder, 'A')
      };
      expect(JSON.stringify(loadedConfigFile)).toEqual(JSON.stringify(expectedConfigFile));
      expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile)).toEqual(configFilePath);
      expect(
        configFileLoader.getPropertyOriginalValue({ parentObject: loadedConfigFile, propertyName: 'thing' })
      ).toEqual('A');
    });

    it('Correctly resolves paths relative to the project root', async () => {
      const configFileLoader: ConfigurationFileLoader<ISimplestConfigFile> = new ConfigurationFileLoader<
        ISimplestConfigFile
      >(schemaPath, {
        jsonPathMetadata: {
          '$.thing': {
            pathResolutionMethod: PathResolutionMethod.resolvePathRelativeToProjectRoot
          }
        }
      });
      const loadedConfigFile: ISimplestConfigFile = await configFileLoader.loadConfigurationFileAsync(
        configFilePath
      );
      const expectedConfigFile: ISimplestConfigFile = {
        thing: nodeJsPath.resolve(projectRoot, 'A')
      };
      expect(JSON.stringify(loadedConfigFile)).toEqual(JSON.stringify(expectedConfigFile));
      expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile)).toEqual(configFilePath);
      expect(
        configFileLoader.getPropertyOriginalValue({ parentObject: loadedConfigFile, propertyName: 'thing' })
      ).toEqual('A');
    });
  });

  describe('A simple config file containing an array', () => {
    const configFileFolder: string = nodeJsPath.resolve(__dirname, 'simpleConfigFile');
    const configFilePath: string = nodeJsPath.resolve(configFileFolder, 'simpleConfigFile.json');
    const schemaPath: string = nodeJsPath.resolve(configFileFolder, 'simpleConfigFile.schema.json');

    interface ISimpleConfigFile {
      things: string[];
    }

    it('Correctly loads the config file', async () => {
      const configFileLoader: ConfigurationFileLoader<ISimpleConfigFile> = new ConfigurationFileLoader<
        ISimpleConfigFile
      >(schemaPath);
      const loadedConfigFile: ISimpleConfigFile = await configFileLoader.loadConfigurationFileAsync(
        configFilePath
      );
      const expectedConfigFile: ISimpleConfigFile = { things: ['A', 'B', 'C'] };
      expect(JSON.stringify(loadedConfigFile)).toEqual(JSON.stringify(expectedConfigFile));
    });

    it('Correctly resolves paths relative to the config file', async () => {
      const configFileLoader: ConfigurationFileLoader<ISimpleConfigFile> = new ConfigurationFileLoader<
        ISimpleConfigFile
      >(schemaPath, {
        jsonPathMetadata: {
          '$.things.*': {
            pathResolutionMethod: PathResolutionMethod.resolvePathRelativeToConfigurationFile
          }
        }
      });
      const loadedConfigFile: ISimpleConfigFile = await configFileLoader.loadConfigurationFileAsync(
        configFilePath
      );
      const expectedConfigFile: ISimpleConfigFile = {
        things: [
          nodeJsPath.resolve(configFileFolder, 'A'),
          nodeJsPath.resolve(configFileFolder, 'B'),
          nodeJsPath.resolve(configFileFolder, 'C')
        ]
      };
      expect(JSON.stringify(loadedConfigFile)).toEqual(JSON.stringify(expectedConfigFile));
    });

    it('Correctly resolves paths relative to the project root', async () => {
      const configFileLoader: ConfigurationFileLoader<ISimpleConfigFile> = new ConfigurationFileLoader<
        ISimpleConfigFile
      >(schemaPath, {
        jsonPathMetadata: {
          '$.things.*': {
            pathResolutionMethod: PathResolutionMethod.resolvePathRelativeToProjectRoot
          }
        }
      });
      const loadedConfigFile: ISimpleConfigFile = await configFileLoader.loadConfigurationFileAsync(
        configFilePath
      );
      const expectedConfigFile: ISimpleConfigFile = {
        things: [
          nodeJsPath.resolve(projectRoot, 'A'),
          nodeJsPath.resolve(projectRoot, 'B'),
          nodeJsPath.resolve(projectRoot, 'C')
        ]
      };
      expect(JSON.stringify(loadedConfigFile)).toEqual(JSON.stringify(expectedConfigFile));
    });
  });

  describe('A simple config file with "extends"', () => {
    const configFileFolder: string = nodeJsPath.resolve(__dirname, 'simpleConfigFileWithExtends');
    const configFilePath: string = nodeJsPath.resolve(configFileFolder, 'simpleConfigFileWithExtends.json');
    const schemaPath: string = nodeJsPath.resolve(
      configFileFolder,
      'simpleConfigFileWithExtends.schema.json'
    );

    interface ISimpleConfigFile {
      things: string[];
    }

    it('Correctly loads the config file with default config meta', async () => {
      const configFileLoader: ConfigurationFileLoader<ISimpleConfigFile> = new ConfigurationFileLoader<
        ISimpleConfigFile
      >(schemaPath);
      const loadedConfigFile: ISimpleConfigFile = await configFileLoader.loadConfigurationFileAsync(
        configFilePath
      );
      const expectedConfigFile: ISimpleConfigFile = { things: ['A', 'B', 'C', 'D', 'E'] };
      expect(JSON.stringify(loadedConfigFile)).toEqual(JSON.stringify(expectedConfigFile));
    });

    it('Correctly loads the config file with "append" in config meta', async () => {
      const configFileLoader: ConfigurationFileLoader<ISimpleConfigFile> = new ConfigurationFileLoader<
        ISimpleConfigFile
      >(schemaPath, {
        propertyInheritanceTypes: {
          things: InheritanceType.append
        }
      });
      const loadedConfigFile: ISimpleConfigFile = await configFileLoader.loadConfigurationFileAsync(
        configFilePath
      );
      const expectedConfigFile: ISimpleConfigFile = { things: ['A', 'B', 'C', 'D', 'E'] };
      expect(JSON.stringify(loadedConfigFile)).toEqual(JSON.stringify(expectedConfigFile));
    });

    it('Correctly loads the config file with "replace" in config meta', async () => {
      const configFileLoader: ConfigurationFileLoader<ISimpleConfigFile> = new ConfigurationFileLoader<
        ISimpleConfigFile
      >(schemaPath, {
        propertyInheritanceTypes: {
          things: InheritanceType.replace
        }
      });
      const loadedConfigFile: ISimpleConfigFile = await configFileLoader.loadConfigurationFileAsync(
        configFilePath
      );
      const expectedConfigFile: ISimpleConfigFile = { things: ['D', 'E'] };
      expect(JSON.stringify(loadedConfigFile)).toEqual(JSON.stringify(expectedConfigFile));
    });

    it('Correctly resolves paths relative to the config file', async () => {
      const configFileLoader: ConfigurationFileLoader<ISimpleConfigFile> = new ConfigurationFileLoader<
        ISimpleConfigFile
      >(schemaPath, {
        jsonPathMetadata: {
          '$.things.*': {
            pathResolutionMethod: PathResolutionMethod.resolvePathRelativeToConfigurationFile
          }
        }
      });
      const loadedConfigFile: ISimpleConfigFile = await configFileLoader.loadConfigurationFileAsync(
        configFilePath
      );
      const parentConfigFileFolder: string = nodeJsPath.resolve(configFileFolder, '..', 'simpleConfigFile');

      const expectedConfigFile: ISimpleConfigFile = {
        things: [
          nodeJsPath.resolve(parentConfigFileFolder, 'A'),
          nodeJsPath.resolve(parentConfigFileFolder, 'B'),
          nodeJsPath.resolve(parentConfigFileFolder, 'C'),
          nodeJsPath.resolve(configFileFolder, 'D'),
          nodeJsPath.resolve(configFileFolder, 'E')
        ]
      };
      expect(JSON.stringify(loadedConfigFile)).toEqual(JSON.stringify(expectedConfigFile));
    });
  });

  describe('A complex config file', () => {
    interface IComplexConfigFile {
      plugins: { plugin: string }[];
    }

    it('Correctly loads a complex config file', async () => {
      const configFilePath: string = nodeJsPath.resolve(__dirname, 'complexConfigFile', 'pluginsB.json');
      const parentConfigFilePath: string = nodeJsPath.resolve(
        __dirname,
        'complexConfigFile',
        'pluginsA.json'
      );
      const schemaPath: string = nodeJsPath.resolve(__dirname, 'complexConfigFile', 'plugins.schema.json');

      const configFileLoader: ConfigurationFileLoader<IComplexConfigFile> = new ConfigurationFileLoader<
        IComplexConfigFile
      >(schemaPath, {
        jsonPathMetadata: {
          '$.plugins.*.plugin': {
            pathResolutionMethod: PathResolutionMethod.NodeResolve
          }
        }
      });
      const loadedConfigFile: IComplexConfigFile = await configFileLoader.loadConfigurationFileAsync(
        configFilePath
      );
      const expectedConfigFile: IComplexConfigFile = {
        plugins: [
          {
            plugin: await FileSystem.getRealPathAsync(
              nodeJsPath.resolve(projectRoot, 'node_modules', '@rushstack', 'node-core-library')
            )
          },
          {
            plugin: await FileSystem.getRealPathAsync(
              nodeJsPath.resolve(projectRoot, 'node_modules', '@rushstack', 'heft')
            )
          },
          {
            plugin: await FileSystem.getRealPathAsync(
              nodeJsPath.resolve(projectRoot, 'node_modules', '@rushstack', 'eslint-config')
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
      ).toEqual('@rushstack/eslint-config');

      expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile.plugins[0])).toEqual(
        parentConfigFilePath
      );
      expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile.plugins[1])).toEqual(configFilePath);
      expect(configFileLoader.getObjectSourceFilePath(loadedConfigFile.plugins[2])).toEqual(configFilePath);
    });
  });

  describe('error cases', () => {
    const errorCasesFolder: string = nodeJsPath.join(__dirname, 'errorCases');

    beforeEach(() => {
      const projectRoot: string = nodeJsPath.resolve(__dirname, '..', '..');
      const formatPathForError: (path: string) => string = (path: string) =>
        `<project root>/${nodeJsPath.relative(projectRoot, path).replace(/\\/g, '/')}`;
      jest.spyOn(ConfigurationFileLoader, '_formatPathForError').mockImplementation(formatPathForError);
      jest.spyOn(JsonFile, '_formatPathForError').mockImplementation(formatPathForError);
    });

    it("throws an error when the file doesn't exist", async () => {
      const errorCaseFolder: string = nodeJsPath.join(errorCasesFolder, 'invalidType');
      const configFileLoader: ConfigurationFileLoader<void> = new ConfigurationFileLoader(
        nodeJsPath.join(errorCaseFolder, 'config.schema.json')
      );
      try {
        await configFileLoader.loadConfigurationFileAsync(nodeJsPath.join(errorCaseFolder, 'notExist.json'));
        fail();
      } catch (e) {
        expect(e).toMatchSnapshot();
      }
    });

    it("Throws an error when the file isn't valid JSON", async () => {
      const errorCaseFolder: string = nodeJsPath.join(errorCasesFolder, 'invalidJson');
      const configFileLoader: ConfigurationFileLoader<void> = new ConfigurationFileLoader(
        nodeJsPath.join(errorCaseFolder, 'config.schema.json')
      );
      try {
        await configFileLoader.loadConfigurationFileAsync(nodeJsPath.join(errorCaseFolder, 'config.json'));
        fail();
      } catch (e) {
        expect(e).toMatchSnapshot();
      }
    });

    it("Throws an error for a file that doesn't match its schema", async () => {
      const errorCaseFolder: string = nodeJsPath.join(errorCasesFolder, 'invalidType');
      const configFileLoader: ConfigurationFileLoader<void> = new ConfigurationFileLoader(
        nodeJsPath.join(errorCaseFolder, 'config.schema.json')
      );
      try {
        await configFileLoader.loadConfigurationFileAsync(nodeJsPath.join(errorCaseFolder, 'config.json'));
        fail();
      } catch (e) {
        expect(e).toMatchSnapshot();
      }
    });

    it('Throws an error when there is a circular reference in "extends" properties', async () => {
      const errorCaseFolder: string = nodeJsPath.join(errorCasesFolder, 'circularReference');
      const configFileLoader: ConfigurationFileLoader<void> = new ConfigurationFileLoader(
        nodeJsPath.join(errorCaseFolder, 'config.schema.json')
      );
      try {
        await configFileLoader.loadConfigurationFileAsync(nodeJsPath.join(errorCaseFolder, 'config1.json'));
        fail();
      } catch (e) {
        expect(e).toMatchSnapshot();
      }
    });

    it("Throws an error when a combined config file doesn't match the schema", async () => {
      const errorCaseFolder: string = nodeJsPath.join(errorCasesFolder, 'invalidCombinedFile');
      const configFileLoader: ConfigurationFileLoader<void> = new ConfigurationFileLoader(
        nodeJsPath.join(errorCaseFolder, 'config.schema.json')
      );

      try {
        await configFileLoader.loadConfigurationFileAsync(nodeJsPath.join(errorCaseFolder, 'config1.json'));
        fail();
      } catch (e) {
        expect(e).toMatchSnapshot();
      }
    });
  });
});
