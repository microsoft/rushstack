// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import type { ProjectConfigurationFile, IJsonPathMetadataResolverOptions } from '@rushstack/heft-config-file';
import type { ITerminal } from '@rushstack/terminal';
import type { IRigConfig } from '@rushstack/rig-package';

import type { IDeleteOperation } from '../plugins/DeleteFilesPlugin';
import type { INodeServicePluginConfiguration } from '../plugins/NodeServicePlugin';
import { Constants } from './Constants';
import {
  LeanProjectConfigurationFile,
  getLeanPropertyOriginalValue,
  type ILeanLoadResult
} from '../configuration/lean/LeanProjectConfigurationFile';
import {
  bail,
  getRigProfileFolder,
  getSharedLeanPackageJsonLookup,
  type LeanPackageJsonLookup
} from '../configuration/lean/LeanResolution';
import { LeanRigConfig } from '../configuration/lean/LeanRigConfig';

export interface IHeftConfigurationJsonActionReference {
  actionName: string;
  defaultParameters?: string[];
}

export interface IHeftConfigurationJsonAliases {
  [aliasName: string]: IHeftConfigurationJsonActionReference;
}

export interface IHeftConfigurationJsonPluginSpecifier {
  pluginPackage: string;
  pluginPackageRoot: string;
  pluginName?: string;
  options?: object;
}

export interface IHeftConfigurationJsonTaskSpecifier {
  taskDependencies?: string[];
  taskPlugin: IHeftConfigurationJsonPluginSpecifier;
}

export interface IHeftConfigurationJsonTasks {
  [taskName: string]: IHeftConfigurationJsonTaskSpecifier;
}

export interface IHeftConfigurationJsonPhaseSpecifier {
  phaseDescription?: string;
  phaseDependencies?: string[];
  cleanFiles?: IDeleteOperation[];
  tasksByName?: IHeftConfigurationJsonTasks;
}

export interface IHeftConfigurationJsonPhases {
  [phaseName: string]: IHeftConfigurationJsonPhaseSpecifier;
}

export interface IHeftConfigurationJson {
  heftPlugins?: IHeftConfigurationJsonPluginSpecifier[];
  aliasesByName?: IHeftConfigurationJsonAliases;
  phasesByName?: IHeftConfigurationJsonPhases;
}

let _heftConfigFileLoader: ProjectConfigurationFile<IHeftConfigurationJson> | undefined;
let _nodeServiceConfigurationLoader: ProjectConfigurationFile<INodeServicePluginConfiguration> | undefined;
let _leanHeftConfigFileLoader: LeanProjectConfigurationFile<IHeftConfigurationJson> | undefined;

function _isGenuineRigConfig(rigConfig: IRigConfig): boolean {
  // A genuine RigConfig can only exist if @rushstack/rig-package has already been loaded
  const { RigConfig } = require('@rushstack/rig-package');
  return rigConfig instanceof RigConfig;
}

/**
 * Loads heft.json using the lean loader. Returns `undefined` if the result might differ from the original
 * `@rushstack/heft-config-file` loader (including every error condition), in which case the original loader
 * must be used.
 */
function _tryLoadHeftConfigurationFileLean(
  projectPath: string,
  rigConfig: IRigConfig | undefined
): ILeanLoadResult<IHeftConfigurationJson> | undefined {
  if (!_leanHeftConfigFileLoader) {
    const packageJsonLookup: LeanPackageJsonLookup = getSharedLeanPackageJsonLookup();
    let heftPluginPackageFolder: string | undefined;
    // Keep in sync with the pluginPackageResolver in loadHeftConfigurationFileForProjectAsync()
    const resolvePluginPackage: (propertyValue: string, configurationFilePath: string) => string = (
      propertyValue: string,
      configurationFilePath: string
    ) => {
      if (propertyValue === Constants.heftPackageName) {
        if (!heftPluginPackageFolder) {
          heftPluginPackageFolder = packageJsonLookup.tryGetPackageFolderFor(__dirname);
        }

        if (!heftPluginPackageFolder) {
          bail();
        }

        return heftPluginPackageFolder;
      } else {
        return packageJsonLookup.resolvePackage(propertyValue, path.dirname(configurationFilePath), true);
      }
    };

    _leanHeftConfigFileLoader = new LeanProjectConfigurationFile<IHeftConfigurationJson>({
      projectRelativeFilePath: `${Constants.projectConfigFolderName}/${Constants.heftConfigurationFilename}`,
      jsonSchemaObject: require('../schemas/heft.schema.json'),
      propertyInheritanceDefaults: {
        array: 'append',
        object: 'merge'
      },
      customResolvers: [
        { path: ['heftPlugins', '*', 'pluginPackage'], resolve: resolvePluginPackage },
        {
          path: ['phasesByName', '*', 'tasksByName', '*', 'taskPlugin', 'pluginPackage'],
          resolve: resolvePluginPackage
        }
      ],
      packageJsonLookup,
      // Never call rigConfig.getResolvedProfileFolder() here: RigConfig caches the profile folder before checking
      // that it exists, so a failed call would change the behavior of the original implementation (which the
      // lean path falls back to). For the rig configs created by Heft, this also avoids loading the "resolve"
      // package on the startup path.
      getRigProfileFolder: (rigConfigToResolve: IRigConfig) =>
        rigConfigToResolve instanceof LeanRigConfig || _isGenuineRigConfig(rigConfigToResolve)
          ? getRigProfileFolder(rigConfigToResolve)
          : bail()
    });
  }

  return _leanHeftConfigFileLoader.tryLoadConfigurationFileForProject(projectPath, rigConfig);
}

/**
 * The pluginPackage field was resolved to the root of the package, but we also want to have
 * the original plugin package name in the config file.
 */
function _normalizeHeftConfigurationFile(
  configurationFile: IHeftConfigurationJson,
  getOriginalPluginPackage: (rawSpecifier: IHeftConfigurationJsonPluginSpecifier) => string
): IHeftConfigurationJson {
  function getUpdatedPluginSpecifier(
    rawSpecifier: IHeftConfigurationJsonPluginSpecifier
  ): IHeftConfigurationJsonPluginSpecifier {
    const pluginPackageName: string = getOriginalPluginPackage(rawSpecifier);
    const newSpecifier: IHeftConfigurationJsonPluginSpecifier = {
      ...rawSpecifier,
      pluginPackageRoot: rawSpecifier.pluginPackage,
      pluginPackage: pluginPackageName
    };
    return newSpecifier;
  }

  const phasesByName: IHeftConfigurationJsonPhases = {};

  const normalizedConfigurationFile: IHeftConfigurationJson = {
    ...configurationFile,
    heftPlugins: configurationFile.heftPlugins?.map(getUpdatedPluginSpecifier) ?? [],
    phasesByName
  };

  for (const [phaseName, phase] of Object.entries(configurationFile.phasesByName || {})) {
    const tasksByName: IHeftConfigurationJsonTasks = {};
    phasesByName[phaseName] = {
      ...phase,
      tasksByName
    };

    for (const [taskName, task] of Object.entries(phase.tasksByName || {})) {
      if (task.taskPlugin) {
        tasksByName[taskName] = {
          ...task,
          taskPlugin: getUpdatedPluginSpecifier(task.taskPlugin)
        };
      } else {
        tasksByName[taskName] = task;
      }
    }
  }

  return normalizedConfigurationFile;
}

export class CoreConfigFiles {
  public static heftConfigurationProjectRelativeFilePath: string = `${Constants.projectConfigFolderName}/${Constants.heftConfigurationFilename}`;

  public static nodeServiceConfigurationProjectRelativeFilePath: string = `${Constants.projectConfigFolderName}/${Constants.nodeServiceConfigurationFilename}`;

  /**
   * Returns the loader for the `config/heft.json` config file.
   */
  public static async loadHeftConfigurationFileForProjectAsync(
    terminal: ITerminal,
    projectPath: string,
    rigConfig?: IRigConfig | undefined
  ): Promise<IHeftConfigurationJson> {
    const leanResult: IHeftConfigurationJson | undefined = CoreConfigFiles._tryLoadHeftConfigurationFileLean(
      terminal,
      projectPath,
      rigConfig
    );
    if (leanResult) {
      return leanResult;
    }

    // Use the original implementation, which produces the canonical errors
    return await CoreConfigFiles._loadHeftConfigurationFileOriginalAsync(terminal, projectPath, rigConfig);
  }

  /**
   * Loads heft.json without using `@rushstack/heft-config-file`. Returns `undefined` if the result could differ
   * from {@link CoreConfigFiles._loadHeftConfigurationFileOriginalAsync}, including for every error condition.
   * @internal
   */
  public static _tryLoadHeftConfigurationFileLean(
    terminal: ITerminal,
    projectPath: string,
    rigConfig: IRigConfig | undefined
  ): IHeftConfigurationJson | undefined {
    const leanResult: ILeanLoadResult<IHeftConfigurationJson> | undefined = _tryLoadHeftConfigurationFileLean(
      projectPath,
      rigConfig
    );
    if (leanResult) {
      for (const message of leanResult.debugMessages) {
        terminal.writeDebugLine(message);
      }

      return _normalizeHeftConfigurationFile(
        leanResult.configurationFile,
        (rawSpecifier: IHeftConfigurationJsonPluginSpecifier) =>
          getLeanPropertyOriginalValue<string>(rawSpecifier, 'pluginPackage')!
      );
    }
  }

  /**
   * Loads heft.json using `@rushstack/heft-config-file` (the original implementation).
   * @internal
   */
  public static async _loadHeftConfigurationFileOriginalAsync(
    terminal: ITerminal,
    projectPath: string,
    rigConfig: IRigConfig | undefined
  ): Promise<IHeftConfigurationJson> {
    const HeftConfigFile: typeof import('@rushstack/heft-config-file') = await import(
      '@rushstack/heft-config-file'
    );
    const { Import, PackageJsonLookup, InternalError } = await import('@rushstack/node-core-library');

    if (!_heftConfigFileLoader) {
      let heftPluginPackageFolder: string | undefined;

      const pluginPackageResolver: (
        options: IJsonPathMetadataResolverOptions<IHeftConfigurationJson>
      ) => string = (options: IJsonPathMetadataResolverOptions<IHeftConfigurationJson>) => {
        const { propertyValue, configurationFilePath } = options;
        if (propertyValue === Constants.heftPackageName) {
          // If the value is "@rushstack/heft", then resolve to the Heft package that is
          // installed in the project folder. This avoids issues with mismatched versions
          // between the project and the globally installed Heft. Use the PackageJsonLookup
          // class to find the package folder to avoid hardcoding the path for compatibility
          // with bundling.
          if (!heftPluginPackageFolder) {
            heftPluginPackageFolder = PackageJsonLookup.instance.tryGetPackageFolderFor(__dirname);
          }

          if (!heftPluginPackageFolder) {
            // This should never happen
            throw new InternalError('Unable to find the @rushstack/heft package folder');
          }

          return heftPluginPackageFolder;
        } else {
          const configurationFileDirectory: string = path.dirname(configurationFilePath);
          return Import.resolvePackage({
            packageName: propertyValue,
            baseFolderPath: configurationFileDirectory,
            allowSelfReference: true
          });
        }
      };

      const schemaObject: object = await import('../schemas/heft.schema.json');
      // eslint-disable-next-line require-atomic-updates
      _heftConfigFileLoader = new HeftConfigFile.ProjectConfigurationFile<IHeftConfigurationJson>({
        projectRelativeFilePath: CoreConfigFiles.heftConfigurationProjectRelativeFilePath,
        jsonSchemaObject: schemaObject,
        propertyInheritanceDefaults: {
          array: { inheritanceType: HeftConfigFile.InheritanceType.append },
          object: { inheritanceType: HeftConfigFile.InheritanceType.merge }
        },
        jsonPathMetadata: {
          // Use a custom resolver for the plugin packages, since the NodeResolve algorithm will resolve to the
          // package.json exports/module property, which may or may not exist.
          '$.heftPlugins.*.pluginPackage': {
            pathResolutionMethod: HeftConfigFile.PathResolutionMethod.custom,
            customResolver: pluginPackageResolver
          },
          // Use a custom resolver for the plugin packages, since the NodeResolve algorithm will resolve to the
          // package.json exports/module property, which may or may not exist.
          '$.phasesByName.*.tasksByName.*.taskPlugin.pluginPackage': {
            pathResolutionMethod: HeftConfigFile.PathResolutionMethod.custom,
            customResolver: pluginPackageResolver
          }
        }
      });
    }

    const heftConfigFileLoader: ProjectConfigurationFile<IHeftConfigurationJson> = _heftConfigFileLoader;

    let configurationFile: IHeftConfigurationJson;
    try {
      configurationFile = await heftConfigFileLoader.loadConfigurationFileForProjectAsync(
        terminal,
        projectPath,
        rigConfig
      );
    } catch (e: unknown) {
      if (
        !(e instanceof Error) ||
        !e.message.startsWith('Resolved configuration object does not match schema')
      ) {
        throw e;
      }

      try {
        // If the config file doesn't match the schema, then we should check to see if it does
        // match the legacy schema. We don't need to worry about the resulting object, we just
        // want to see if it parses. We will use the ConfigurationFile class to load it to ensure
        // that we follow the "extends" chain for the entire config file.
        const legacySchemaObject: object = await import('../schemas/heft-legacy.schema.json');
        const legacyConfigFileLoader: ProjectConfigurationFile<unknown> =
          new HeftConfigFile.ProjectConfigurationFile<unknown>({
            projectRelativeFilePath: CoreConfigFiles.heftConfigurationProjectRelativeFilePath,
            jsonSchemaObject: legacySchemaObject
          });
        await legacyConfigFileLoader.loadConfigurationFileForProjectAsync(terminal, projectPath, rigConfig);
      } catch (e2) {
        // It doesn't match the legacy schema either. Throw the original error.
        throw e;
      }
      // Matches the legacy schema, so throw a more helpful error.
      throw new Error(
        "This project's Heft configuration appears to be using an outdated schema.\n\n" +
          'Heft 0.51.0 introduced a major breaking change for Heft configuration files. ' +
          'Your project appears to be using the older file format. You will need to ' +
          'migrate your project to the new format. Follow these instructions: ' +
          'https://rushstack.io/link/heft-0.51'
      );
    }

    return _normalizeHeftConfigurationFile(
      configurationFile,
      (rawSpecifier: IHeftConfigurationJsonPluginSpecifier) =>
        heftConfigFileLoader.getPropertyOriginalValue({
          parentObject: rawSpecifier,
          propertyName: 'pluginPackage'
        })!
    );
  }

  public static async tryLoadNodeServiceConfigurationFileAsync(
    terminal: ITerminal,
    projectPath: string,
    rigConfig?: IRigConfig | undefined
  ): Promise<INodeServicePluginConfiguration | undefined> {
    if (!_nodeServiceConfigurationLoader) {
      const HeftConfigFile: typeof import('@rushstack/heft-config-file') = await import(
        '@rushstack/heft-config-file'
      );
      const schemaObject: object = await import('../schemas/node-service.schema.json');
      // eslint-disable-next-line require-atomic-updates
      _nodeServiceConfigurationLoader = new HeftConfigFile.ProjectConfigurationFile<INodeServicePluginConfiguration>({
        projectRelativeFilePath: CoreConfigFiles.nodeServiceConfigurationProjectRelativeFilePath,
        jsonSchemaObject: schemaObject
      });
    }

    const configurationFile: INodeServicePluginConfiguration | undefined =
      await _nodeServiceConfigurationLoader.tryLoadConfigurationFileForProjectAsync(
        terminal,
        projectPath,
        rigConfig
      );
    return configurationFile;
  }
}
