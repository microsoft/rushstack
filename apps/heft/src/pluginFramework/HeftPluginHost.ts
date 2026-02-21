// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { SyncHook } from 'tapable';

import { InternalError } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';

import type { HeftPluginDefinitionBase } from '../configuration/HeftPluginDefinition.ts';
import type { IHeftPlugin } from './IHeftPlugin.ts';

export abstract class HeftPluginHost {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _pluginAccessRequestHooks: Map<string, SyncHook<any>> = new Map();
  private _pluginsApplied: boolean = false;

  public async applyPluginsAsync(terminal: ITerminal): Promise<void> {
    if (this._pluginsApplied) {
      // No need to apply them a second time.
      return;
    }
    terminal.writeVerboseLine('Applying plugins');
    await this.applyPluginsInternalAsync();
    this._pluginsApplied = true;
  }

  protected abstract applyPluginsInternalAsync(): Promise<void>;

  /**
   * Registers a callback used to provide access to a requested plugin via the plugin accessor.
   */
  public requestAccessToPluginByName<T extends object>(
    requestorName: string,
    pluginToAccessPackage: string,
    pluginToAccessName: string,
    accessorCallback: (pluginAccessor: T) => void
  ): void {
    if (this._pluginsApplied) {
      throw new Error(
        `Requestor ${JSON.stringify(requestorName)} cannot request access to plugin ` +
          `${JSON.stringify(pluginToAccessName)} from package ${JSON.stringify(pluginToAccessPackage)} ` +
          `after plugins have been applied.`
      );
    }

    const pluginHookName: string = this.getPluginHookName(pluginToAccessPackage, pluginToAccessName);
    let pluginAccessRequestHook: SyncHook<T> | undefined = this._pluginAccessRequestHooks.get(pluginHookName);
    if (!pluginAccessRequestHook) {
      pluginAccessRequestHook = new SyncHook(['pluginAccessor']);
      this._pluginAccessRequestHooks.set(pluginHookName, pluginAccessRequestHook);
    }
    if (pluginAccessRequestHook.taps.some((t) => t.name === requestorName)) {
      throw new Error(
        `Plugin ${JSON.stringify(pluginToAccessName)} from ${JSON.stringify(pluginToAccessPackage)} has ` +
          `already been accessed by ${JSON.stringify(requestorName)}.`
      );
    }
    pluginAccessRequestHook.tap(requestorName, accessorCallback);
  }

  /**
   * Gets the name of the hook that is registered with the plugin access request hook.
   */
  public getPluginHookName(pluginPackageName: string, pluginName: string): string {
    return `${pluginPackageName};${pluginName}`;
  }

  /**
   * Resolves all plugin requests for the specified plugin. All plugins that requested access to the
   * specified plugin will have their callbacks invoked, and will be provided with the accessor for
   * the specified plugin.
   */
  protected resolvePluginAccessRequests(
    plugin: IHeftPlugin,
    pluginDefinition: HeftPluginDefinitionBase
  ): void {
    if (this._pluginsApplied) {
      throw new InternalError('Cannot resolve plugin access requests after plugins have been applied.');
    }
    const pluginHookName: string = this.getPluginHookName(
      pluginDefinition.pluginPackageName,
      pluginDefinition.pluginName
    );
    const pluginAccessRequestHook: SyncHook<object> | undefined =
      this._pluginAccessRequestHooks.get(pluginHookName);
    if (pluginAccessRequestHook?.isUsed()) {
      const accessor: object | undefined = plugin.accessor;
      if (accessor) {
        pluginAccessRequestHook.call(accessor);
      } else {
        throw new Error(
          `Plugin ${JSON.stringify(pluginDefinition.pluginName)} from package ` +
            `${JSON.stringify(pluginDefinition.pluginPackageName)} does not provide an accessor property, ` +
            `so it does not provide access to other plugins.`
        );
      }
    }
  }
}
