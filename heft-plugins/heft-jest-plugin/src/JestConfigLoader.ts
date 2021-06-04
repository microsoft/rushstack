import * as path from 'path';
import merge from 'deepmerge';
import { Import, JsonFile } from '@rushstack/node-core-library';

import type { Config } from '@jest/types';

/**
 *
 */
export class JestConfigLoader {
  private static readonly _rootDirRegex: RegExp = /<rootDir>/g;
  private static readonly _defaultReporter: string = 'DEFAULT';

  /**
   * Load the full text of the final Jest config file, substituting specified tokens for
   * provided values.
   */
  public static async loadConfigAsync(filePath: string, rootDir: string): Promise<Config.InitialOptions> {
    let config: Config.InitialOptions = await JestConfigLoader._readConfigAsync(filePath);

    // If a preset exists, let's load it manually and unset the preset string so that Jest normalization
    // is not affected. This means that we can support a couple features here that stock Jest doesn't have:
    // - support loading non-root presets
    // - support for loading presets further than 1 level deep
    if (config.preset) {
      const presetConfigPath: string = JestConfigLoader._resolveConfigModule(
        config.preset,
        filePath,
        rootDir,
        'preset'
      );
      const presetConfig: Config.InitialOptions = await JestConfigLoader._loadPresetAndResolveModulesAsync(
        presetConfigPath,
        rootDir
      );
      config = JestConfigLoader._mergeConfig(config, presetConfig);
      config.preset = undefined;
    }

    return config;
  }

  private static async _readConfigAsync(configPath: string): Promise<Config.InitialOptions> {
    try {
      return await JsonFile.loadAsync(configPath);
    } catch (e) {
      throw new Error(`Could not load Jest config at path "${configPath}".`);
    }
  }

  private static async _loadPresetAndResolveModulesAsync(
    presetConfigPath: string,
    rootDir: string
  ): Promise<Config.InitialOptions> {
    const presetConfig: Config.InitialOptions = await JestConfigLoader._readConfigAsync(presetConfigPath);

    // Resolve all input module and relative path properties to absolute paths so there is no confusion where
    // the module should be resolved from.
    // NOTE: Preset works differently since Jest normally only allows a preset referenced with a relative path,
    // else it will default to a specific config filename. We work around this by resolving the entire config
    // before passing it to Jest, so there is no "preset" value actually passed in.
    // https://github.com/facebook/jest/blob/0a902e10e0a5550b114340b87bd31764a7638729/packages/jest-config/src/normalize.ts#L131
    for (const key of Object.keys(presetConfig) as (keyof Config.InitialOptions)[]) {
      switch (key) {
        case 'setupFiles':
        case 'setupFilesAfterEnv':
        case 'snapshotSerializers':
          const arrayValue: string[] | undefined = presetConfig[key];
          if (arrayValue) {
            presetConfig[key] = arrayValue.map(
              (value) => JestConfigLoader._resolveConfigModule(value, presetConfigPath, rootDir, key) ?? value
            );
          }
          break;
        case 'dependencyExtractor':
        case 'globalSetup':
        case 'globalTeardown':
        case 'moduleLoader':
        case 'snapshotResolver':
        case 'testResultsProcessor':
        case 'testRunner':
        case 'filter':
        case 'runner':
        case 'prettierPath':
        case 'preset':
        case 'resolver':
          const stringValue: string | null | undefined = presetConfig[key];
          if (stringValue) {
            const resolvedModulePath: string | undefined = JestConfigLoader._resolveConfigModule(
              stringValue,
              presetConfigPath,
              rootDir,
              key
            );
            if (resolvedModulePath) {
              presetConfig[key] = resolvedModulePath;
            }
          }
          break;
        case 'reporters':
          const reporterConfig: (string | Config.ReporterConfig)[] | undefined = presetConfig[key];
          if (reporterConfig) {
            presetConfig[key] = reporterConfig.map((reporterValue: string | Config.ReporterConfig) => {
              if (Array.isArray(reporterValue)) {
                if (reporterValue[0].toUpperCase() === JestConfigLoader._defaultReporter) {
                  return reporterValue;
                }
                const newReporterPath: string | undefined = JestConfigLoader._resolveConfigModule(
                  reporterValue[0],
                  presetConfigPath,
                  rootDir,
                  key
                );
                if (newReporterPath) {
                  const newReporter: Config.ReporterConfig = [...reporterValue];
                  newReporter[0] = newReporterPath;
                  return newReporter;
                } else {
                  return reporterValue;
                }
              } else {
                if (reporterValue.toUpperCase() === JestConfigLoader._defaultReporter) {
                  return reporterValue;
                }
                const newReporterPath: string | undefined = JestConfigLoader._resolveConfigModule(
                  reporterValue,
                  presetConfigPath,
                  rootDir,
                  key
                );
                return newReporterPath ?? reporterValue;
              }
            });
          }
          break;
        case 'transform':
          const transformConfig: { [regex: string]: string | Config.TransformerConfig } | undefined =
            presetConfig[key];
          for (const [regex, transformValue] of Object.entries(transformConfig || {})) {
            if (Array.isArray(transformValue)) {
              const newTransformerPath: string | undefined = JestConfigLoader._resolveConfigModule(
                transformValue[0],
                presetConfigPath,
                rootDir,
                key
              );
              if (newTransformerPath) {
                transformValue[0] = newTransformerPath;
              }
            } else {
              const newTransformerPath: string | undefined = JestConfigLoader._resolveConfigModule(
                transformValue,
                presetConfigPath,
                rootDir,
                key
              );
              if (newTransformerPath) {
                transformConfig![regex] = newTransformerPath;
              }
            }
          }
          break;
        default:
          // No-op
          break;
      }
    }

    // Recurse into the preset config and merge before returning
    if (presetConfig.preset) {
      const childPresetConfig: Config.InitialOptions =
        await JestConfigLoader._loadPresetAndResolveModulesAsync(presetConfig.preset, rootDir);
      return JestConfigLoader._mergeConfig(presetConfig, childPresetConfig);
    } else {
      return presetConfig;
    }
  }

  private static _resolveConfigModule(
    moduleSpec: string,
    configPath: string,
    rootDir: string,
    propertyName: string
  ): string {
    // Return undefined if <rootDir> is provided to avoid attempting path operations on the returned
    // value before validating it
    if (JestConfigLoader._rootDirRegex.test(moduleSpec)) {
      moduleSpec = moduleSpec.replace(JestConfigLoader._rootDirRegex, rootDir);
    }
    try {
      return Import.resolveModule({
        modulePath: moduleSpec,
        baseFolderPath: path.dirname(configPath)
      });
    } catch (e) {
      throw new Error(
        `Unable to resolve module "${moduleSpec}" from Jest configuration property "${propertyName}" in "${configPath}".`
      );
    }
  }

  private static _mergeConfig(
    config: Config.InitialOptions,
    preset: Config.InitialOptions
  ): Config.InitialOptions {
    // Adapted from setupPreset in jest-config:
    // https://github.com/facebook/jest/blob/0a902e10e0a5550b114340b87bd31764a7638729/packages/jest-config/src/normalize.ts#L124
    const manuallyMergedConfig: Config.InitialOptions = {};
    if (config.setupFiles || preset.setupFiles) {
      manuallyMergedConfig.setupFiles = (preset.setupFiles || []).concat(config.setupFiles || []);
    }
    if (config.setupFilesAfterEnv || preset.setupFilesAfterEnv) {
      manuallyMergedConfig.setupFilesAfterEnv = (preset.setupFilesAfterEnv || []).concat(
        config.setupFilesAfterEnv || []
      );
    }
    if (config.modulePathIgnorePatterns || preset.modulePathIgnorePatterns) {
      manuallyMergedConfig.modulePathIgnorePatterns = (preset.modulePathIgnorePatterns || []).concat(
        config.modulePathIgnorePatterns || []
      );
    }
    if (config.moduleNameMapper || preset.moduleNameMapper) {
      manuallyMergedConfig.moduleNameMapper = {
        ...(preset.moduleNameMapper || {}),
        ...(config.moduleNameMapper || {})
      };
    }
    if (config.transform || preset.transform) {
      manuallyMergedConfig.transform = {
        ...(preset.transform || {}),
        ...(config.transform || {})
      };
    }
    if (config.globals || preset.globals) {
      manuallyMergedConfig.globals = merge(preset.globals || {}, config.globals || {});
    }
    return { ...preset, ...config, ...manuallyMergedConfig };
  }
}
