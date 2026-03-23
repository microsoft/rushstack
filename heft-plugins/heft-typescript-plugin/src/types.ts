// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as TTypescript from 'typescript';

export interface ITypescriptWorkerData {
  /**
   * Path to the version of TypeScript to use.
   */
  typeScriptToolPath: string;
}

export interface ITranspilationRequestMessage {
  /**
   * Unique identifier for this request.
   */
  requestId: number;
  /**
   * The tsconfig compiler options to use for the request.
   */
  compilerOptions: TTypescript.CompilerOptions;
  /**
   * The variants to emit.
   */
  moduleKindsToEmit: ICachedEmitModuleKind[];
  /**
   * The set of files to build.
   */
  filesToTranspile: Map<string, string>;
}

export interface ITranspilationSuccessMessage {
  requestId: number;
  type: 'success';
  result: TTypescript.EmitResult;
}

export interface ITranspilationErrorMessage {
  requestId: number;
  type: 'error';
  result: {
    message: string;
    [key: string]: unknown;
  };
}

export type ITranspilationResponseMessage = ITranspilationSuccessMessage | ITranspilationErrorMessage;

export interface ICachedEmitModuleKind {
  moduleKind: TTypescript.ModuleKind;

  outFolderPath: string;

  /**
   * File extension to use instead of '.js' for emitted ECMAScript files.
   * For example, '.cjs' to indicate commonjs content, or '.mjs' to indicate ECMAScript modules.
   */
  jsExtensionOverride: string | undefined;

  /**
   * Set to true if this is the emit kind that is specified in the tsconfig.json.
   * Declarations are only emitted for the primary module kind.
   */
  isPrimary: boolean;

  /**
   * If true, a package.json with the appropriate "type" field will be written
   * to the output folder after emit.
   */
  emitModulePackageJson: boolean;
}
