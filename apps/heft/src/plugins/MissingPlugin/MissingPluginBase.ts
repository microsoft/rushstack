// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { FileSystem, Path } from '@rushstack/node-core-library';
import { Hook } from 'tapable';

import { HeftConfiguration } from '../../configuration/HeftConfiguration';
import { HeftSession } from '../../pluginFramework/HeftSession';
import { ScopedLogger } from '../../pluginFramework/logging/ScopedLogger';
import { IHeftPlugin } from '../../pluginFramework/IHeftPlugin';

export abstract class MissingPluginBase implements IHeftPlugin {
  public abstract readonly pluginName: string;
  public abstract readonly missingPluginName: string;
  public abstract readonly missingPluginPackageNames: ReadonlyArray<string>;
  public abstract readonly missingPluginDocumentationUrl: string;

  public abstract apply(heftSession: HeftSession, heftConfiguration: HeftConfiguration): void;

  protected abstract getConfigFilePath(heftConfiguration: HeftConfiguration): string;

  /**
   * A utility method to use as the tap function to the provided hook. Determines if the
   * requested plugin is installed and warns otherwise if related configuration files were
   * found. Returns false if the plugin was found, otherwise true.
   */
  protected async checkForMissingPlugin(
    heftConfiguration: HeftConfiguration,
    heftSession: HeftSession,
    hookToTap: Hook<any, any, any, any, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  ): Promise<boolean> {
    let hasPlugin: boolean = false;
    for (const tap of hookToTap.taps) {
      if (tap.name === this.missingPluginName) {
        hasPlugin = true;
      }
    }

    // If we have the plugin, we don't need to check anything else
    if (hasPlugin) {
      return false;
    }

    // Warn if any were found
    const configFilePath: string = this.getConfigFilePath(heftConfiguration);
    if (await FileSystem.existsAsync(configFilePath)) {
      const logger: ScopedLogger = heftSession.requestScopedLogger(this.pluginName);
      logger.emitWarning(
        new Error(
          'The configuration file at ' +
            `"${Path.convertToSlashes(path.relative(heftConfiguration.buildFolder, configFilePath))}" ` +
            'exists in your project, but the associated Heft plugin is not enabled. To fix this, you can add ' +
            `${this.missingPluginPackageNames.map((packageName) => `"${packageName}"`).join(' or ')} ` +
            'to your package.json devDependencies and use config/heft.json to load it. ' +
            `For details, see this documentation: ${this.missingPluginDocumentationUrl}`
        )
      );
    }

    return true;
  }
}
