// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as TTypescript from 'typescript';

/**
 * @beta
 */
export interface IExtendedProgram extends TTypescript.Program {
  /**
   * https://github.com/microsoft/TypeScript/blob/5f597e69b2e3b48d788cb548df40bcb703c8adb1/src/compiler/types.ts#L3205
   */
  getSourceFiles(): ReadonlyArray<IExtendedSourceFile>;

  /**
   * https://github.com/microsoft/TypeScript/blob/5f597e69b2e3b48d788cb548df40bcb703c8adb1/src/compiler/program.ts#L1024-L1048
   */
  getCommonSourceDirectory(): string;
}

/**
 * @beta
 */
export interface IExtendedSourceFile extends TTypescript.SourceFile {
  /**
   * https://github.com/microsoft/TypeScript/blob/5f597e69b2e3b48d788cb548df40bcb703c8adb1/src/compiler/types.ts#L3011
   */
  version: string;
}
