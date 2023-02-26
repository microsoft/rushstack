// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as TTypescript from 'typescript';

/**
 * https://github.com/microsoft/TypeScript/blob/e9868e96e87996df46a13b4323866acc639e71ce/src/compiler/types.ts#L8010
 */
export interface ISourceFileMayBeEmittedHost {
  getCompilerOptions(): TTypescript.CompilerOptions;
  isSourceFileFromExternalLibrary(file: TTypescript.SourceFile): boolean;
  getResolvedProjectReferenceToRedirect(fileName: string): TTypescript.ResolvedProjectReference | undefined;
  isSourceOfProjectReferenceRedirect(fileName: string): boolean;
}

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
   * https://github.com/microsoft/TypeScript/blob/782c09d783e006a697b4ba6d1e7ec2f718ce8393/src/compiler/utilities.ts#L6540
   */
  matchFiles(
    path: string,
    extensions: ReadonlyArray<string> | undefined,
    excludes: ReadonlyArray<string> | undefined,
    includes: ReadonlyArray<string> | undefined,
    useCaseSensitiveFileNames: boolean,
    currentDirectory: string,
    depth: number | undefined,
    getFileSystemEntries: (path: string) => {
      readonly files: ReadonlyArray<string>;
      readonly directories: ReadonlyArray<string>;
    },
    realpath: (path: string) => string,
    directoryExists: (path: string) => boolean
  ): string[];

  /**
   * https://github.com/microsoft/TypeScript/blob/e9868e96e87996df46a13b4323866acc639e71ce/src/compiler/utilities.ts#L6168
   */
  sourceFileMayBeEmitted(
    sourceFile: TTypescript.SourceFile,
    host: ISourceFileMayBeEmittedHost,
    forceDtsEmit?: boolean
  ): boolean;

  Diagnostics: {
    // https://github.com/microsoft/TypeScript/blob/5f597e69b2e3b48d788cb548df40bcb703c8adb1/src/compiler/diagnosticMessages.json#L4252-L4255
    // eslint-disable-next-line @typescript-eslint/naming-convention
    Found_1_error_Watching_for_file_changes: TTypescript.DiagnosticMessage;

    // https://github.com/microsoft/TypeScript/blob/5f597e69b2e3b48d788cb548df40bcb703c8adb1/src/compiler/diagnosticMessages.json#L4256-L4259
    // eslint-disable-next-line @typescript-eslint/naming-convention
    Found_0_errors_Watching_for_file_changes: TTypescript.DiagnosticMessage;

    // https://github.com/microsoft/TypeScript/blob/2428ade1a91248e847f3e1561e31a9426650efee/src/compiler/diagnosticMessages.json#L2252
    // eslint-disable-next-line @typescript-eslint/naming-convention
    Property_0_has_no_initializer_and_is_not_definitely_assigned_in_the_constructor: TTypescript.DiagnosticMessage;

    // https://github.com/microsoft/TypeScript/blob/2428ade1a91248e847f3e1561e31a9426650efee/src/compiler/diagnosticMessages.json#L4920
    // eslint-disable-next-line @typescript-eslint/naming-convention
    Element_implicitly_has_an_any_type_because_expression_of_type_0_can_t_be_used_to_index_type_1: TTypescript.DiagnosticMessage;
  };
}

export type ExtendedTypeScript = typeof TTypescript & IExtendedTypeScript;
