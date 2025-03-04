// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  InheritanceType,
  PathResolutionMethod,
  type IConfigurationFileOptions,
  type IProjectConfigurationFileOptions
} from '@rushstack/heft-config-file';
import type { ITerminal } from '@rushstack/terminal';

import javascriptEmitKindsSchema from '../../schemas/javascript-emit-kinds.schema.json';

/**
 * The JavaScript module kind to emit.
 * @public
 */
export type JavaScriptModuleKind = 'amd' | 'commonjs' | 'es2015' | 'esnext' | 'system' | 'umd';
/**
 * The script target to emit.
 * @public
 */
export type JavaScriptTarget =
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
export interface IJavaScriptEmitKind {
  outputFolder: string;
  moduleKind: JavaScriptModuleKind;
  target: JavaScriptTarget;
}

/**
 * Options for the JsEmitKindsPlugin.
 * @public
 */
export interface IJavaScriptEmitKindsConfigurationJson {
  emitKinds: IJavaScriptEmitKind[];
}

export const JavaScriptEmitKinds: IConfigurationFileOptions<
  IJavaScriptEmitKindsConfigurationJson,
  IProjectConfigurationFileOptions
> = {
  projectRelativeFilePath: 'config/javascript-emit-kinds.json',
  jsonSchemaObject: javascriptEmitKindsSchema,
  propertyInheritance: {
    emitKinds: {
      inheritanceType: InheritanceType.append
    }
  },
  jsonPathMetadata: {
    'emitKinds.*.outputFolder': {
      pathResolutionMethod: PathResolutionMethod.resolvePathRelativeToProjectRoot
    }
  },
  customValidationFunction: (
    jsonObject: IJavaScriptEmitKindsConfigurationJson,
    resolvedConfigurationFilePathForLogging: string,
    terminal: ITerminal
  ): boolean => {
    let valid: boolean = true;
    const emitKindByOutputFolder: Map<string, IJavaScriptEmitKind> = new Map();
    for (const emitKind of jsonObject.emitKinds) {
      const existingEmitKind: IJavaScriptEmitKind | undefined = emitKindByOutputFolder.get(
        emitKind.outputFolder
      );
      if (existingEmitKind) {
        valid = false;
        terminal.writeError(
          `Output folder "${emitKindByOutputFolder}" in "${resolvedConfigurationFilePathForLogging}" is specified multiple times.`
        );
      }
      emitKindByOutputFolder.set(emitKind.outputFolder, emitKind);
    }
    return valid;
  }
};
