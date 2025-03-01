// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { HeftConfiguration } from '../configuration/HeftConfiguration';
import type { IHeftTaskPlugin } from '../pluginFramework/IHeftPlugin';
import type { IHeftTaskSession } from '../pluginFramework/HeftTaskSession';

/**
 * The module kind to emit.
 * @public
 */
export type ModuleKind = 'amd' | 'commonjs' | 'es2015' | 'esnext' | 'system' | 'umd';
/**
 * The script target to emit.
 * @public
 */
export type ScriptTarget =
  | 'es3'
  | 'es5'
  | 'es6'
  | 'es2015'
  | 'es2016'
  | 'es2017'
  | 'es2018'
  | 'es2019'
  | 'es2020'
  | 'es2021'
  | 'es2022'
  | 'esnext';

/**
 * Description of an emit kind.
 * Plugins that emit multiple kinds should use this interface to describe the kinds they emit.
 * @public
 */
export interface IJsEmitKind {
  outputFolder: string;
  moduleKind: ModuleKind;
  target: ScriptTarget;
}

/**
 * Options for the JsEmitKindsPlugin.
 * @public
 */
export interface IJsEmitKindsPluginOptions {
  emitKinds: IJsEmitKind[];
}

/**
 * Accessor for the JsEmitKindsPlugin.
 * @public
 */
export interface IJsEmitKindsPluginAccessor {
  /**
   * The emit kinds that the plugin has registered.
   */
  emitKinds: ReadonlyMap<string, Readonly<IJsEmitKind>>;

  /**
   * The name of the task this plugin was registered in, for analysis.
   */
  taskName: string;
}

/**
 * Name of the JsEmitKindsPlugin. Used when requesting access to it.
 * Callers should locally redefine the constant so that they don't have a runtime dependency on this package.
 * @public
 */
export type JsEmitKindsPluginName = 'js-emit-kinds-plugin';

/**
 * Plugin that centralizes configuration of the kinds of JavaScript emitted by the TypeScript plugin and others.
 */
export default class JsEmitKindsPlugin implements IHeftTaskPlugin<IJsEmitKindsPluginOptions> {
  public readonly pluginName: JsEmitKindsPluginName = 'js-emit-kinds-plugin';

  private readonly _emitKinds: Map<string, IJsEmitKind>;
  private readonly _accessor: IJsEmitKindsPluginAccessor;

  public constructor() {
    this._emitKinds = new Map();
    this._accessor = {
      emitKinds: this._emitKinds,
      taskName: ''
    };
  }

  public get accessor(): IJsEmitKindsPluginAccessor {
    return this._accessor;
  }

  public apply(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    pluginOptions: IJsEmitKindsPluginOptions
  ): void {
    const emitKindsMap: Map<string, IJsEmitKind> = this._emitKinds;
    this._accessor.taskName = taskSession.taskName;
    const { emitKinds } = pluginOptions;
    const { slashNormalizedBuildFolderPath } = heftConfiguration;
    for (const emitKind of emitKinds) {
      const absolutePath: string = `${slashNormalizedBuildFolderPath}/${emitKind.outputFolder}`;
      if (emitKindsMap.has(absolutePath)) {
        throw new Error(`Duplicate emit kind output folder: ${emitKind.outputFolder}`);
      }
      emitKindsMap.set(absolutePath, emitKind);
    }
  }
}
