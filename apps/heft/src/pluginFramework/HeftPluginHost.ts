// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { InternalError } from '@rushstack/node-core-library';
import { SyncHook } from 'tapable';

import type { HeftPluginDefinitionBase } from '../configuration/HeftPluginDefinition';
import type { IHeftPlugin } from './IHeftPlugin';

/**
 * @public
 */
export type RequestAccessToPluginByNameCallback = (
  pluginToAccessPackage: string,
  pluginToAccessName: string,
  pluginApply: (pluginAccessor: object) => void
) => void;

/**
 * @internal
 */
export abstract class HeftPluginHost {
  private readonly _pluginHooks: Map<string, SyncHook<object>> = new Map();

  /**
   * @internal
   */
  public abstract applyPluginsAsync(): Promise<void>;

  /**
   * @internal
   */
  protected getRequestAccessToPluginByNameFn(applyTapName: string): RequestAccessToPluginByNameCallback {
    return (
      pluginToAccessPackage: string,
      pluginToAccessName: string,
      pluginApply: (pluginAccessor: object) => void
    ) => {
      const pluginHookName: string = this.getPluginHookName(pluginToAccessPackage, pluginToAccessName);
      let pluginHook: SyncHook<object> | undefined = this._pluginHooks.get(pluginHookName);
      if (!pluginHook) {
        pluginHook = new SyncHook(['pluginAccessor']);
        this._pluginHooks.set(pluginHookName, pluginHook);
      }
      if (pluginHook.taps.some((t) => t.name === applyTapName)) {
        throw new InternalError(
          `Plugin "${pluginToAccessName}" from "${pluginToAccessPackage}" has already been accessed ` +
            `by "${applyTapName}".`
        );
      }
      pluginHook.tap(applyTapName, pluginApply);
    };
  }

  /**
   * @internal
   */
  protected async applyPluginHooksAsync(
    plugin: IHeftPlugin,
    pluginDefinition: HeftPluginDefinitionBase
  ): Promise<void> {
    const pluginHookName: string = this.getPluginHookName(
      pluginDefinition.pluginPackageName,
      pluginDefinition.pluginName
    );
    const pluginHook: SyncHook<object> | undefined = this._pluginHooks.get(pluginHookName);
    const accessor: object | undefined = plugin.accessor;
    if (pluginHook && pluginHook.taps.length > 0) {
      if (!accessor) {
        throw new Error(
          `Plugin "${pluginDefinition.pluginName}" from package "${pluginDefinition.pluginPackageName}" ` +
            'does not provide an accessor property, so it does not provide access to other plugins.'
        );
      } else {
        pluginHook.call(accessor);
      }
    }
  }

  /**
   * @internal
   */
  protected getPluginHookName(pluginPackageName: string, pluginName: string): string {
    return `${pluginPackageName};${pluginName}`;
  }
}
