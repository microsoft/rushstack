// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { ConfigurationFile, InheritanceType, PathResolutionMethod } from '@rushstack/heft-config-file';
import { Import, ITerminal } from '@rushstack/node-core-library';
import type { RigConfig } from '@rushstack/rig-package';

import type { IDeleteOperation } from '../plugins/DeleteFilesPlugin';

export type HeftEventKind = 'copyFiles' | 'deleteFiles' | 'runScript';

export interface IHeftConfigurationJsonEventSpecifier {
  eventKind: HeftEventKind;
  options?: object;
}

export interface IHeftConfigurationJsonPluginSpecifier {
  pluginPackage: string;
  pluginPackageRoot: string;
  pluginName?: string;
  options?: object;
}

export interface IHeftConfigurationJsonTaskSpecifier {
  taskDependencies?: string[];
  taskEvent?: IHeftConfigurationJsonEventSpecifier;
  taskPlugin?: IHeftConfigurationJsonPluginSpecifier;
}

export interface IHeftConfigurationJsonTasks {
  [taskName: string]: IHeftConfigurationJsonTaskSpecifier;
}

export interface IHeftConfigurationJsonPhaseSpecifier {
  phaseDescription?: string;
  phaseDependencies?: string[];
  cleanAdditionalFiles?: IDeleteOperation[];
  tasksByName?: IHeftConfigurationJsonTasks;
}

export interface IHeftConfigurationJsonPhases {
  [phaseName: string]: IHeftConfigurationJsonPhaseSpecifier;
}

export interface IHeftConfigurationJson {
  heftPlugins?: IHeftConfigurationJsonPluginSpecifier[];
  phasesByName?: IHeftConfigurationJsonPhases;
}

export class CoreConfigFiles {
  private static _heftConfigFileLoader: ConfigurationFile<IHeftConfigurationJson> | undefined;

  /**
   * Returns the loader for the `config/heft.json` config file.
   */
  public static async loadHeftConfigurationFileForProjectAsync(
    terminal: ITerminal,
    projectPath: string,
    rigConfig?: RigConfig | undefined
  ): Promise<IHeftConfigurationJson> {
    if (!CoreConfigFiles._heftConfigFileLoader) {
      const pluginPackageResolver: (
        configurationFilePath: string,
        propertyName: string,
        propertyValue: string
      ) => string = (configurationFilePath: string, propertyName: string, propertyValue: string) => {
        const configurationFileDirectory: string = path.dirname(configurationFilePath);
        return Import.resolvePackage({
          packageName: propertyValue,
          baseFolderPath: configurationFileDirectory
        });
      };

      const schemaPath: string = path.join(__dirname, '..', 'schemas', 'heft.schema.json');
      CoreConfigFiles._heftConfigFileLoader = new ConfigurationFile<IHeftConfigurationJson>({
        projectRelativeFilePath: 'config/heft.json',
        jsonSchemaPath: schemaPath,
        propertyInheritanceDefaults: {
          array: { inheritanceType: InheritanceType.append },
          object: { inheritanceType: InheritanceType.merge }
        },
        jsonPathMetadata: {
          // Use a custom resolver for the plugin packages, since the NodeResolve algorithm will resolve to the
          // package.json exports/module property, which may or may not exist.
          '$.heftPlugins.*.pluginPackage': {
            pathResolutionMethod: PathResolutionMethod.custom,
            customResolver: pluginPackageResolver
          },
          // Use a custom resolver for the plugin packages, since the NodeResolve algorithm will resolve to the
          // package.json exports/module property, which may or may not exist.
          '$.phasesByName.*.tasksByName.*.taskPlugin.pluginPackage': {
            pathResolutionMethod: PathResolutionMethod.custom,
            customResolver: pluginPackageResolver
          },
          // Special handling for "runScript" task events to resolve the script path
          '$.phasesByName.*.tasksByName[?(@.taskEvent && @.taskEvent.eventKind == "runScript")].taskEvent.options.scriptPath':
            {
              pathResolutionMethod: PathResolutionMethod.resolvePathRelativeToProjectRoot
            }
        }
      });
    }

    const configurationFile: IHeftConfigurationJson =
      await CoreConfigFiles._heftConfigFileLoader.loadConfigurationFileForProjectAsync(
        terminal,
        projectPath,
        rigConfig
      );

    // The pluginPackage field was resolved to the root of the package, but we also want to have
    // the original plugin package name in the config file. Gather all the plugin specifiers so we can
    // add the original data ourselves.
    const pluginSpecifiers: IHeftConfigurationJsonPluginSpecifier[] = [
      ...(configurationFile.heftPlugins || [])
    ];
    for (const { tasksByName } of Object.values(configurationFile.phasesByName || {})) {
      for (const { taskPlugin } of Object.values(tasksByName || {})) {
        if (taskPlugin) {
          pluginSpecifiers.push(taskPlugin);
        }
      }
    }

    for (const pluginSpecifier of pluginSpecifiers) {
      const pluginPackageName: string = CoreConfigFiles._heftConfigFileLoader.getPropertyOriginalValue({
        parentObject: pluginSpecifier,
        propertyName: 'pluginPackage'
      })!;
      pluginSpecifier.pluginPackageRoot = pluginSpecifier.pluginPackage;
      pluginSpecifier.pluginPackage = pluginPackageName;
    }

    return configurationFile;
  }
}
