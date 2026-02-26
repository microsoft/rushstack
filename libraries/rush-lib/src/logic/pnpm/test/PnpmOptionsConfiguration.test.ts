// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import { FileSystem, JsonFile } from '@rushstack/node-core-library';
import { PnpmOptionsConfiguration } from '../PnpmOptionsConfiguration';
import { TestUtilities } from '@rushstack/heft-config-file';

const fakeCommonTempFolder: string = path.join(__dirname, 'common', 'temp');

describe(PnpmOptionsConfiguration.name, () => {
  it('throw error if pnpm-config.json does not exist', () => {
    expect(() => {
      PnpmOptionsConfiguration.loadFromJsonFileOrThrow(
        `${__dirname}/pnpm-config-not-exist.json`,
        fakeCommonTempFolder
      );
    }).toThrow(/does not exist/);
  });

  it('validates unknown property', () => {
    expect(() =>
      PnpmOptionsConfiguration.loadFromJsonFileOrThrow(
        `${__dirname}/jsonFiles/pnpm-config-unknown.json`,
        fakeCommonTempFolder
      )
    ).toThrow(/must NOT have additional properties/);
  });

  it('loads overrides', () => {
    const pnpmConfiguration: PnpmOptionsConfiguration = PnpmOptionsConfiguration.loadFromJsonFileOrThrow(
      `${__dirname}/jsonFiles/pnpm-config-overrides.json`,
      fakeCommonTempFolder
    );

    expect(TestUtilities.stripAnnotations(pnpmConfiguration.globalOverrides)).toEqual({
      foo: '^1.0.0',
      quux: 'npm:@myorg/quux@^1.0.0',
      'bar@^2.1.0': '3.0.0',
      'qar@1>zoo': '2'
    });

    expect(TestUtilities.stripAnnotations(pnpmConfiguration.environmentVariables)).toEqual({
      NODE_OPTIONS: {
        value: '--max-old-space-size=4096',
        override: false
      }
    });
  });

  it('loads packageExtensions', () => {
    const pnpmConfiguration: PnpmOptionsConfiguration = PnpmOptionsConfiguration.loadFromJsonFileOrThrow(
      `${__dirname}/jsonFiles/pnpm-config-packageExtensions.json`,
      fakeCommonTempFolder
    );

    expect(TestUtilities.stripAnnotations(pnpmConfiguration.globalPackageExtensions)).toEqual({
      'react-redux': {
        peerDependencies: {
          'react-dom': '*'
        }
      }
    });
  });

  it('loads neverBuiltDependencies', () => {
    const pnpmConfiguration: PnpmOptionsConfiguration = PnpmOptionsConfiguration.loadFromJsonFileOrThrow(
      `${__dirname}/jsonFiles/pnpm-config-neverBuiltDependencies.json`,
      fakeCommonTempFolder
    );

    expect(TestUtilities.stripAnnotations(pnpmConfiguration.globalNeverBuiltDependencies)).toEqual([
      'fsevents',
      'level'
    ]);
  });

  it('loads onlyBuiltDependencies', () => {
    const pnpmConfiguration: PnpmOptionsConfiguration = PnpmOptionsConfiguration.loadFromJsonFileOrThrow(
      `${__dirname}/jsonFiles/pnpm-config-onlyBuiltDependencies.json`,
      fakeCommonTempFolder
    );

    expect(TestUtilities.stripAnnotations(pnpmConfiguration.globalOnlyBuiltDependencies)).toEqual([
      'esbuild',
      'playwright',
      '@swc/core'
    ]);
  });

  it('loads minimumReleaseAge', () => {
    const pnpmConfiguration: PnpmOptionsConfiguration = PnpmOptionsConfiguration.loadFromJsonFileOrThrow(
      `${__dirname}/jsonFiles/pnpm-config-minimumReleaseAge.json`,
      fakeCommonTempFolder
    );

    expect(pnpmConfiguration.minimumReleaseAge).toEqual(1440);
    expect(TestUtilities.stripAnnotations(pnpmConfiguration.minimumReleaseAgeExclude)).toEqual([
      'webpack',
      '@myorg/*'
    ]);
  });

  it('loads catalog and catalogs', () => {
    const pnpmConfiguration: PnpmOptionsConfiguration = PnpmOptionsConfiguration.loadFromJsonFileOrThrow(
      `${__dirname}/jsonFiles/pnpm-config-catalog.json`,
      fakeCommonTempFolder
    );

    expect(TestUtilities.stripAnnotations(pnpmConfiguration.globalCatalogs)).toEqual({
      default: {
        react: '^18.0.0',
        'react-dom': '^18.0.0',
        typescript: '~5.3.0'
      },
      frontend: {
        vue: '^3.4.0',
        'vue-router': '^4.2.0'
      },
      backend: {
        express: '^4.18.0',
        fastify: '^4.26.0'
      }
    });
  });

  describe('updateGlobalCatalogs', () => {
    it('updates and saves globalCatalogs to pnpm-config.json', () => {
      const testConfigPath: string = path.join(__dirname, 'temp', 'pnpm-config-update-test.json');

      const tempDir: string = path.dirname(testConfigPath);
      FileSystem.ensureFolder(tempDir);

      try {
        const initialConfig = {
          globalCatalogs: {
            default: {
              react: '^18.0.0'
            }
          }
        };
        JsonFile.save(initialConfig, testConfigPath, { ensureFolderExists: true });

        const pnpmConfiguration: PnpmOptionsConfiguration = PnpmOptionsConfiguration.loadFromJsonFileOrThrow(
          testConfigPath,
          fakeCommonTempFolder
        );

        const updatedCatalogs = {
          default: {
            react: '^18.2.0',
            'react-dom': '^18.2.0'
          },
          frontend: {
            vue: '^3.4.0'
          }
        };
        pnpmConfiguration.updateGlobalCatalogs(updatedCatalogs);

        const reloadedConfig: PnpmOptionsConfiguration = PnpmOptionsConfiguration.loadFromJsonFileOrThrow(
          testConfigPath,
          fakeCommonTempFolder
        );

        expect(TestUtilities.stripAnnotations(reloadedConfig.globalCatalogs)).toEqual(updatedCatalogs);
      } finally {
        // Clean up
        if (FileSystem.exists(testConfigPath)) {
          FileSystem.deleteFile(testConfigPath);
        }
      }
    });

    it('handles undefined catalogs', async () => {
      const testConfigPath: string = `${__dirname}/temp/pnpm-config-undefined-test.json`;

      try {
        const initialConfig = {
          globalCatalogs: {
            default: {
              react: '^18.0.0'
            }
          }
        };
        await JsonFile.saveAsync(initialConfig, testConfigPath, { ensureFolderExists: true });

        const pnpmConfiguration: PnpmOptionsConfiguration = PnpmOptionsConfiguration.loadFromJsonFileOrThrow(
          testConfigPath,
          fakeCommonTempFolder
        );

        pnpmConfiguration.updateGlobalCatalogs(undefined);

        const reloadedConfig: PnpmOptionsConfiguration = PnpmOptionsConfiguration.loadFromJsonFileOrThrow(
          testConfigPath,
          fakeCommonTempFolder
        );

        expect(reloadedConfig.globalCatalogs).toBeUndefined();
      } finally {
        await FileSystem.deleteFileAsync(testConfigPath);
      }
    });
  });

  describe('$schema handling', () => {
    it('does not fail when $schema is undefined', async () => {
      const testConfigPath: string = `${__dirname}/temp/pnpm-config-no-schema.json`;

      try {
        const configWithoutSchema = {
          globalCatalogs: {
            default: {
              react: '^18.0.0'
            }
          }
        };
        await JsonFile.saveAsync(configWithoutSchema, testConfigPath, { ensureFolderExists: true });

        const pnpmConfiguration: PnpmOptionsConfiguration = PnpmOptionsConfiguration.loadFromJsonFileOrThrow(
          testConfigPath,
          fakeCommonTempFolder
        );

        const updatedCatalogs = {
          default: {
            react: '^18.2.0'
          }
        };

        expect(() => {
          pnpmConfiguration.updateGlobalCatalogs(updatedCatalogs);
        }).not.toThrow();

        const reloadedConfig: PnpmOptionsConfiguration = PnpmOptionsConfiguration.loadFromJsonFileOrThrow(
          testConfigPath,
          fakeCommonTempFolder
        );

        expect(TestUtilities.stripAnnotations(reloadedConfig.globalCatalogs)).toEqual(updatedCatalogs);
      } finally {
        await FileSystem.deleteFile(testConfigPath);
      }
    });

    it('preserves $schema when it exists', () => {
      const testConfigPath: string = `${__dirname}/temp/pnpm-config-with-schema.json`;

      try {
        // Create config with $schema
        const configWithSchema = {
          $schema: 'https://developer.microsoft.com/json-schemas/rush/v5/pnpm-config.schema.json',
          globalCatalogs: {
            default: {
              react: '^18.0.0'
            }
          }
        };
        await JsonFile.saveAsync(configWithSchema, testConfigPath, { ensureFolderExists: true });

        const pnpmConfiguration: PnpmOptionsConfiguration = PnpmOptionsConfiguration.loadFromJsonFileOrThrow(
          testConfigPath,
          fakeCommonTempFolder
        );

        const updatedCatalogs = {
          default: {
            react: '^18.2.0'
          }
        };
        pnpmConfiguration.updateGlobalCatalogs(updatedCatalogs);

        const savedConfig = JsonFile.load(testConfigPath);
        expect(savedConfig.$schema).toBe(
          'https://developer.microsoft.com/json-schemas/rush/v5/pnpm-config.schema.json'
        );
      } finally {
        await FileSystem.deleteFile(testConfigPath);
      }
    });

    it('handles undefined in updateGlobalOnlyBuiltDependenciesAsync', async () => {
      const testConfigPath: string = `${__dirname}/temp/pnpm-config-undefined-test.json`;

      try {
        const initialConfig = {
          $schema: 'https://developer.microsoft.com/json-schemas/rush/v5/pnpm-config.schema.json',
          globalOnlyBuiltDependencies: ['node-gyp', 'esbuild']
        };
        await JsonFile.saveAsync(initialConfig, testConfigPath, { ensureFolderExists: true });

        const pnpmConfiguration: PnpmOptionsConfiguration = PnpmOptionsConfiguration.loadFromJsonFileOrThrow(
          testConfigPath,
          fakeCommonTempFolder
        );

        expect(TestUtilities.stripAnnotations(pnpmConfiguration.globalOnlyBuiltDependencies)).toEqual([
          'node-gyp',
          'esbuild'
        ]);

        await expect(
          pnpmConfiguration.updateGlobalOnlyBuiltDependenciesAsync(undefined)
        ).resolves.not.toThrow();

        const reloadedConfig: PnpmOptionsConfiguration = PnpmOptionsConfiguration.loadFromJsonFileOrThrow(
          testConfigPath,
          fakeCommonTempFolder
        );
        expect(reloadedConfig.globalOnlyBuiltDependencies).toBeUndefined();

        const savedConfigJson = JsonFile.load(testConfigPath);
        expect(savedConfigJson.$schema).toBe(
          'https://developer.microsoft.com/json-schemas/rush/v5/pnpm-config.schema.json'
        );
        expect(savedConfigJson.globalOnlyBuiltDependencies).toBeUndefined();
      } finally {
        if (FileSystem.exists(testConfigPath)) {
          FileSystem.deleteFile(testConfigPath);
        }
      }
    });
  });
});
