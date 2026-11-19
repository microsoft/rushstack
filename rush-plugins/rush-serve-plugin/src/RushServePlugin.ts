// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import type { IRushPlugin, RushSession, RushConfiguration, IPhasedCommand } from '@rushstack/rush-sdk';

import { PLUGIN_NAME } from './constants';
import type { IBaseRoutingRuleJson, IRoutingRule } from './types';

export interface IGlobalRoutingFolderRuleJson extends IBaseRoutingRuleJson {
  workspaceRelativeFile: undefined;
  workspaceRelativeFolder: string;
}

export interface IGlobalRoutingFileRuleJson extends IBaseRoutingRuleJson {
  workspaceRelativeFile: string;
  workspaceRelativeFolder: undefined;
}

export type IGlobalRoutingRuleJson = IGlobalRoutingFileRuleJson | IGlobalRoutingFolderRuleJson;

export interface IRushServePluginOptions {
  /**
   * The names of phased commands to which the plugin should be applied.
   */
  phasedCommands: ReadonlyArray<string>;

  /**
   * The URL path at which to host the web socket connection for monitoring build status. If not specified, the web socket interface will not be enabled.
   */
  buildStatusWebSocketPath?: string;

  /**
   * The name of a parameter that Rush is configured to use to pass a port number to underlying operations.
   * If specified, the plugin will ensure the value is synchronized with the port used for its server.
   */
  portParameterLongName?: string | undefined;

  /**
   * The URL path at which to host Rush log files. If not specified, log files will not be served.
   */
  logServePath?: string | undefined;

  /**
   * Routing rules for files that are associated with the entire workspace, rather than a single project (e.g. files output by Rush plugins).
   */
  globalRouting?: IGlobalRoutingRuleJson[];
}

/**
 * @public
 */
export class RushServePlugin implements IRushPlugin {
  public readonly pluginName: 'RushServePlugin' = PLUGIN_NAME;

  readonly #phasedCommands: Set<string>;
  readonly #portParameterLongName: string | undefined;
  readonly #globalRoutingRules: IGlobalRoutingRuleJson[];
  readonly #logServePath: string | undefined;
  readonly #buildStatusWebSocketPath: string | undefined;

  public constructor(options: IRushServePluginOptions) {
    const {
      phasedCommands,
      portParameterLongName,
      globalRouting = [],
      logServePath,
      buildStatusWebSocketPath
    } = options;
    this.#phasedCommands = new Set(phasedCommands);
    this.#portParameterLongName = portParameterLongName;
    this.#globalRoutingRules = globalRouting;
    this.#logServePath = logServePath;
    this.#buildStatusWebSocketPath = buildStatusWebSocketPath;
  }

  public apply(rushSession: RushSession, rushConfiguration: RushConfiguration): void {
    const handler: (command: IPhasedCommand) => Promise<void> = async (command: IPhasedCommand) => {
      const globalRoutingRules: IRoutingRule[] = this.#globalRoutingRules.map(
        (rule: IGlobalRoutingRuleJson) => {
          const { workspaceRelativeFile, workspaceRelativeFolder } = rule;
          const diskPath: string = workspaceRelativeFolder ?? workspaceRelativeFile;
          return {
            type: workspaceRelativeFile ? 'file' : 'folder',
            diskPath: path.resolve(rushConfiguration.rushJsonFolder, diskPath),
            servePath: rule.servePath,
            immutable: !!rule.immutable
          };
        }
      );

      // Defer importing the implementation until this plugin is actually invoked.
      await (
        await import('./phasedCommandHandler')
      ).phasedCommandHandler({
        rushSession,
        rushConfiguration,
        command,
        portParameterLongName: this.#portParameterLongName,
        logServePath: this.#logServePath,
        globalRoutingRules,
        buildStatusWebSocketPath: this.#buildStatusWebSocketPath
      });
    };

    for (const commandName of this.#phasedCommands) {
      // Only activate the plugin for the commands requested in the config
      rushSession.hooks.runPhasedCommand.for(commandName).tapPromise(PLUGIN_NAME, handler);
    }
  }
}

export default RushServePlugin;
