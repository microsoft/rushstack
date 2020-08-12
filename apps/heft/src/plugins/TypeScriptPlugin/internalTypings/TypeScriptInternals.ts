// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Typescript as TTypescript } from '@microsoft/rush-stack-compiler-3.7';

// The specifics of these types aren't important
/**
 * https://github.com/microsoft/TypeScript/blob/5f597e69b2e3b48d788cb548df40bcb703c8adb1/src/compiler/types.ts#L3969-L4010
 */
export interface IEmitResolver {}

/**
 * https://github.com/microsoft/TypeScript/blob/5f597e69b2e3b48d788cb548df40bcb703c8adb1/src/compiler/types.ts#L5969-L5988
 */
export interface IEmitHost {}

/**
 * https://github.com/microsoft/TypeScript/blob/5f597e69b2e3b48d788cb548df40bcb703c8adb1/src/compiler/types.ts#L3338-L3341
 */
export interface IEmitTransformers {}

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
export interface IExtendedSourceFile extends TTypescript.SourceFile {
  /**
   * https://github.com/microsoft/TypeScript/blob/5f597e69b2e3b48d788cb548df40bcb703c8adb1/src/compiler/types.ts#L3011
   */
  version: string;
}

/**
 * https://github.com/microsoft/TypeScript/blob/5f597e69b2e3b48d788cb548df40bcb703c8adb1/src/compiler/utilities.ts#L3799-L3803
 */
export interface IResolveModuleNameResolutionHost {
  getCanonicalFileName(p: string): string;
  getCommonSourceDirectory(): string;
  getCurrentDirectory(): string;
}

export interface IExtendedTypeScript {
  /**
   * https://github.com/microsoft/TypeScript/blob/5f597e69b2e3b48d788cb548df40bcb703c8adb1/src/compiler/performance.ts#L3
   */
  performance: {
    /**
     * https://github.com/microsoft/TypeScript/blob/5f597e69b2e3b48d788cb548df40bcb703c8adb1/src/compiler/performance.ts#L110-L116
     */
    enable(): void;

    /**
     * https://github.com/microsoft/TypeScript/blob/5f597e69b2e3b48d788cb548df40bcb703c8adb1/src/compiler/performance.ts#L55-L61
     */
    mark(performanceMaker: string): void;

    /**
     * https://github.com/microsoft/TypeScript/blob/5f597e69b2e3b48d788cb548df40bcb703c8adb1/src/compiler/performance.ts#L72-L78
     */
    measure(measureName: string, startMarkName?: string, endMarkName?: string): void;

    /**
     * https://github.com/microsoft/TypeScript/blob/5f597e69b2e3b48d788cb548df40bcb703c8adb1/src/compiler/performance.ts#L94-L96
     */
    getDuration(measureName: string): number;

    /**
     * https://github.com/microsoft/TypeScript/blob/5f597e69b2e3b48d788cb548df40bcb703c8adb1/src/compiler/performance.ts#L85-L87
     */
    getCount(measureName: string): number;
  };

  /**
   * https://github.com/microsoft/TypeScript/blob/5f597e69b2e3b48d788cb548df40bcb703c8adb1/src/compiler/utilities.ts#L4720-L4734
   */
  readJson(filePath: string): object;

  /**
   * https://github.com/microsoft/TypeScript/blob/5f597e69b2e3b48d788cb548df40bcb703c8adb1/src/compiler/utilities.ts#L5848-L5907
   */
  matchFiles(
    path: string,
    extensions: ReadonlyArray<string> | undefined,
    excludes: ReadonlyArray<string> | undefined,
    includes: ReadonlyArray<string> | undefined,
    useCaseSensitiveFileNames: boolean,
    currentDirectory: string,
    depth: number | undefined,
    getFileSystemEntries: (
      path: string
    ) => {
      readonly files: ReadonlyArray<string>;
      readonly directories: ReadonlyArray<string>;
    },
    realpath: (path: string) => string
  ): string[];

  /**
   * https://github.com/microsoft/TypeScript/blob/5f597e69b2e3b48d788cb548df40bcb703c8adb1/src/compiler/emitter.ts#L261-L614
   */
  emitFiles(
    resolver: IEmitResolver,
    host: IEmitHost,
    targetSourceFile: TTypescript.SourceFile | undefined,
    emitTransformers: IEmitTransformers,
    emitOnlyDtsFiles?: boolean,
    onlyBuildInfo?: boolean,
    forceDtsEmit?: boolean
  ): TTypescript.EmitResult;

  /**
   * https://github.com/microsoft/TypeScript/blob/5f597e69b2e3b48d788cb548df40bcb703c8adb1/src/compiler/transformer.ts#L30-L35
   */
  getTransformers(
    compilerOptions: TTypescript.CompilerOptions,
    customTransformers?: TTypescript.CustomTransformers,
    emitOnlyDtsFiles?: boolean
  ): IEmitTransformers;

  /**
   * https://github.com/microsoft/TypeScript/blob/5f597e69b2e3b48d788cb548df40bcb703c8adb1/src/compiler/utilities.ts#L6100-L6108
   */
  removeFileExtension(path: string): string;

  /**
   * https://github.com/microsoft/TypeScript/blob/5f597e69b2e3b48d788cb548df40bcb703c8adb1/src/compiler/utilities.ts#L3826-L3833
   */
  getExternalModuleNameFromPath(
    host: IResolveModuleNameResolutionHost,
    fileName: string,
    referencePath?: string
  ): string;
}

export type ExtendedTypeScript = typeof TTypescript & IExtendedTypeScript;
