// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';

import { ConfigFileLoader, IConfigMeta, InheritanceType, ResolutionMethod } from '../ConfigFileLoader';

describe('ConfigLoader', () => {
  const projectRoot: string = path.resolve(__dirname, '..', '..', '..');
  let configFileLoader: ConfigFileLoader;

  beforeEach(() => {
    configFileLoader = new ConfigFileLoader();
  });

  describe('A simple config file', () => {
    const configFileFolder: string = path.resolve(__dirname, 'simplestConfigFile');
    const configFilePath: string = path.resolve(configFileFolder, 'simplestConfigFile.json');
    const schemaPath: string = path.resolve(configFileFolder, 'simplestConfigFile.schema.json');

    interface ISimplestConfigFile {
      thing: string;
    }

    it('Correctly loads the config file', async () => {
      const configMeta: IConfigMeta<ISimplestConfigFile> = {
        schemaPath
      };

      const loadedConfigFile: ISimplestConfigFile = await configFileLoader.loadConfigFileAsync(
        configFilePath,
        configMeta
      );
      expect(loadedConfigFile).toEqual({ thing: 'A' });
    });

    it('Correctly resolves paths relative to the config file', async () => {
      const configMeta: IConfigMeta<ISimplestConfigFile> = {
        schemaPath,
        propertyPathResolution: {
          thing: {
            resolutionMethod: ResolutionMethod.resolvePathRelativeToConfigFile
          }
        }
      };

      const loadedConfigFile: ISimplestConfigFile = await configFileLoader.loadConfigFileAsync(
        configFilePath,
        configMeta
      );
      expect(loadedConfigFile).toEqual({
        thing: path.resolve(configFileFolder, 'A')
      });
    });

    it('Correctly resolves paths relative to the project root', async () => {
      const configMeta: IConfigMeta<ISimplestConfigFile> = {
        schemaPath,
        propertyPathResolution: {
          thing: {
            resolutionMethod: ResolutionMethod.resolvePathRelativeToProjectRoot
          }
        }
      };

      const loadedConfigFile: ISimplestConfigFile = await configFileLoader.loadConfigFileAsync(
        configFilePath,
        configMeta
      );
      expect(loadedConfigFile).toEqual({
        thing: path.resolve(projectRoot, 'A')
      });
    });
  });

  describe('A simple config file containing an array', () => {
    const configFileFolder: string = path.resolve(__dirname, 'simpleConfigFile');
    const configFilePath: string = path.resolve(configFileFolder, 'simpleConfigFile.json');
    const schemaPath: string = path.resolve(configFileFolder, 'simpleConfigFile.schema.json');

    interface ISimpleConfigFile {
      things: string[];
    }

    it('Correctly loads the config file', async () => {
      const configMeta: IConfigMeta<ISimpleConfigFile> = {
        schemaPath
      };

      const loadedConfigFile: ISimpleConfigFile = await configFileLoader.loadConfigFileAsync(
        configFilePath,
        configMeta
      );
      expect(loadedConfigFile).toEqual({ things: ['A', 'B', 'C'] });
    });

    it('Correctly resolves paths relative to the config file', async () => {
      const configMeta: IConfigMeta<ISimpleConfigFile> = {
        schemaPath,
        propertyPathResolution: {
          things: {
            objectEntriesHandling: {
              resolutionMethod: ResolutionMethod.resolvePathRelativeToConfigFile
            }
          }
        }
      };

      const loadedConfigFile: ISimpleConfigFile = await configFileLoader.loadConfigFileAsync(
        configFilePath,
        configMeta
      );
      expect(loadedConfigFile).toEqual({
        things: [
          path.resolve(configFileFolder, 'A'),
          path.resolve(configFileFolder, 'B'),
          path.resolve(configFileFolder, 'C')
        ]
      });
    });

    it('Correctly resolves paths relative to the project root', async () => {
      const configMeta: IConfigMeta<ISimpleConfigFile> = {
        schemaPath,
        propertyPathResolution: {
          things: {
            objectEntriesHandling: {
              resolutionMethod: ResolutionMethod.resolvePathRelativeToProjectRoot
            }
          }
        }
      };

      const loadedConfigFile: ISimpleConfigFile = await configFileLoader.loadConfigFileAsync(
        configFilePath,
        configMeta
      );
      const projectRoot: string = path.resolve(__dirname, '..', '..', '..');
      expect(loadedConfigFile).toEqual({
        things: [
          path.resolve(projectRoot, 'A'),
          path.resolve(projectRoot, 'B'),
          path.resolve(projectRoot, 'C')
        ]
      });
    });
  });

  describe('A simple config file with "extends"', () => {
    const configFileFolder: string = path.resolve(__dirname, 'simpleConfigFileWithExtends');
    const configFilePath: string = path.resolve(configFileFolder, 'simpleConfigFileWithExtends.json');
    const schemaPath: string = path.resolve(configFileFolder, 'simpleConfigFileWithExtends.schema.json');

    interface ISimpleConfigFile {
      things: string[];
    }

    it('Correctly loads the config file with default config meta', async () => {
      const configMeta: IConfigMeta<ISimpleConfigFile> = {
        schemaPath
      };
      const loadedConfigFile: ISimpleConfigFile = await configFileLoader.loadConfigFileAsync(
        configFilePath,
        configMeta
      );
      expect(loadedConfigFile).toEqual({ things: ['A', 'B', 'C', 'D', 'E'] });
    });

    it('Correctly loads the config file with "append" in config meta', async () => {
      const configMeta: IConfigMeta<ISimpleConfigFile> = {
        schemaPath,
        propertyInheritance: {
          things: InheritanceType.append
        }
      };
      const loadedConfigFile: ISimpleConfigFile = await configFileLoader.loadConfigFileAsync(
        configFilePath,
        configMeta
      );
      expect(loadedConfigFile).toEqual({ things: ['A', 'B', 'C', 'D', 'E'] });
    });

    it('Correctly loads the config file with "replace" in config meta', async () => {
      const configMeta: IConfigMeta<ISimpleConfigFile> = {
        schemaPath,
        propertyInheritance: {
          things: InheritanceType.replace
        }
      };

      const loadedConfigFile: ISimpleConfigFile = await configFileLoader.loadConfigFileAsync(
        configFilePath,
        configMeta
      );
      expect(loadedConfigFile).toEqual({ things: ['D', 'E'] });
    });

    it('Correctly resolves paths relative to the config file', async () => {
      const configMeta: IConfigMeta<ISimpleConfigFile> = {
        schemaPath,
        propertyPathResolution: {
          things: {
            objectEntriesHandling: {
              resolutionMethod: ResolutionMethod.resolvePathRelativeToConfigFile
            }
          }
        }
      };
      const loadedConfigFile: ISimpleConfigFile = await configFileLoader.loadConfigFileAsync(
        configFilePath,
        configMeta
      );
      const parentConfigFileFolder: string = path.resolve(configFileFolder, '..', 'simpleConfigFile');
      expect(loadedConfigFile).toEqual({
        things: [
          path.resolve(parentConfigFileFolder, 'A'),
          path.resolve(parentConfigFileFolder, 'B'),
          path.resolve(parentConfigFileFolder, 'C'),
          path.resolve(configFileFolder, 'D'),
          path.resolve(configFileFolder, 'E')
        ]
      });
    });
  });

  describe('A complex config file', () => {
    interface IComplexConfigFile {
      plugins: { plugin: string }[];
    }

    it('Correctly loads a complex config file', async () => {
      const configFilePath: string = path.resolve(__dirname, 'complexConfigFile', 'pluginsB.json');
      const schemaPath: string = path.resolve(__dirname, '..', '..', 'schemas', 'plugins.schema.json');
      const configMeta: IConfigMeta<IComplexConfigFile> = {
        schemaPath,
        propertyInheritance: {
          plugins: InheritanceType.append
        },
        propertyPathResolution: {
          plugins: {
            objectEntriesHandling: {
              childPropertyHandling: {
                plugin: {
                  resolutionMethod: ResolutionMethod.NodeResolve
                }
              }
            }
          }
        }
      };

      const loadedConfigFile: IComplexConfigFile = await configFileLoader.loadConfigFileAsync(
        configFilePath,
        configMeta
      );
      expect(loadedConfigFile).toEqual({
        plugins: [
          {
            plugin: path.resolve(projectRoot, 'node_modules', '@jest', 'core')
          },
          {
            plugin: path.resolve(projectRoot, 'node_modules', '@rushstack', 'heft')
          },
          {
            plugin: path.resolve(projectRoot, 'node_modules', 'glob')
          }
        ]
      });
    });
  });
});
