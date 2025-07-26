// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as TTypescript from 'typescript';

export interface IExtendedSolutionBuilder
  extends TTypescript.SolutionBuilder<TTypescript.EmitAndSemanticDiagnosticsBuilderProgram> {
  getBuildOrder(): readonly string[];
  invalidateProject(configFilePath: string, mode: 0 | 1 | 2): void;
}

/**
 * @internal
 */
export interface ITypeScriptNodeSystem extends TTypescript.System {
  /**
   * https://github.com/microsoft/TypeScript/blob/d85767abfd83880cea17cea70f9913e9c4496dcc/src/compiler/sys.ts#L1438
   */
  getAccessibleFileSystemEntries?: (folderPath: string) => {
    files: string[];
    directories: string[];
  };
}

/**
 * @internal
 */
export interface IExtendedTypeScript {
  /**
   * https://github.com/microsoft/TypeScript/blob/5f597e69b2e3b48d788cb548df40bcb703c8adb1/src/compiler/performance.ts#L3
   */
  performance: {
    /**
     * https://github.com/microsoft/TypeScript/blob/5f597e69b2e3b48d788cb548df40bcb703c8adb1/src/compiler/performance.ts#L119-L121
     */
    disable(): void;

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

  transpileOptionValueCompilerOptions: {
    name: keyof TTypescript.CompilerOptions;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transpileOptionValue: any;
  }[];

  getNewLineCharacter(compilerOptions: TTypescript.CompilerOptions): string;

  createCompilerHost(
    options: TTypescript.CompilerOptions,
    setParentNodes?: boolean,
    system?: TTypescript.System
  ): TTypescript.CompilerHost;

  createCompilerHostWorker(
    options: TTypescript.CompilerOptions,
    setParentNodes?: boolean,
    system?: TTypescript.System
  ): TTypescript.CompilerHost;

  combinePaths(path1: string, path2: string): string;

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

export type ExtendedBuilderProgram = TTypescript.BuilderProgram & {
  /**
   * Typescript 5.6+
   */
  state?: { changedFilesSet: Set<string> };
  /**
   * Typescript < 5.6
   */
  getState(): { changedFilesSet: Set<string> };
};
