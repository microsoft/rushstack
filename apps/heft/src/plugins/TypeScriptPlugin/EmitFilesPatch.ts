// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { Path, InternalError } from '@rushstack/node-core-library';
import { Typescript as TTypescript } from '@microsoft/rush-stack-compiler-3.7';
import {
  ExtendedTypeScript,
  IEmitResolver,
  IEmitHost,
  IEmitTransformers,
  IExtendedSourceFile
} from './internalTypings/TypeScriptInternals';

export interface ICachedEmitModuleKind {
  moduleKind: TTypescript.ModuleKind;

  outFolderPath: string;

  /**
   * TypeScript's output is placed in the \<project root\>/.heft/build-cache folder.
   * This is the the path to the subfolder in the build-cache folder that this emit kind
   * written to.
   */
  cacheOutFolderPath: string;

  /**
   * Set to true if this is the emit kind that is specified in the tsconfig.json.
   * Sourcemaps and declarations are only emitted for the primary module kind.
   */
  isPrimary: boolean;
}

export class EmitFilesPatch {
  private static _patchedTs: ExtendedTypeScript | undefined = undefined;

  // eslint-disable-next-line
  private static _baseEmitFiles: any | undefined = undefined;

  private static _originalOutDir: string | undefined = undefined;
  private static _redirectedOutDir: string | undefined = undefined;

  public static install(
    ts: ExtendedTypeScript,
    tsconfig: TTypescript.ParsedCommandLine,
    moduleKindsToEmit: ICachedEmitModuleKind[],
    useBuildCache: boolean,
    changedFiles?: Set<IExtendedSourceFile>
  ): void {
    if (EmitFilesPatch._patchedTs !== undefined) {
      throw new InternalError(
        'EmitFilesPatch.install() cannot be called without first uninstalling the existing patch'
      );
    }
    EmitFilesPatch._patchedTs = ts;
    EmitFilesPatch._baseEmitFiles = ts.emitFiles;

    let foundPrimary: boolean = false;
    let defaultModuleKind: TTypescript.ModuleKind;

    for (const moduleKindToEmit of moduleKindsToEmit) {
      if (moduleKindToEmit.isPrimary) {
        if (foundPrimary) {
          throw new Error('Multiple primary module emit kinds encountered.');
        } else {
          foundPrimary = true;
        }
        defaultModuleKind = moduleKindToEmit.moduleKind;
      }
    }

    // Override the underlying file emitter to run itself once for each flavor
    // This is a rather inelegant way to convince the TypeScript compiler not to duplicate parse/link/check
    ts.emitFiles = (
      resolver: IEmitResolver,
      host: IEmitHost,
      targetSourceFile: IExtendedSourceFile | undefined,
      emitTransformers: IEmitTransformers,
      emitOnlyDtsFiles?: boolean,
      onlyBuildInfo?: boolean,
      forceDtsEmit?: boolean
    ): TTypescript.EmitResult => {
      if (onlyBuildInfo || emitOnlyDtsFiles) {
        // There should only be one tsBuildInfo and one set of declaration files
        return EmitFilesPatch._baseEmitFiles(
          resolver,
          host,
          targetSourceFile,
          emitTransformers,
          emitOnlyDtsFiles,
          onlyBuildInfo,
          forceDtsEmit
        );
      } else {
        if (targetSourceFile && changedFiles) {
          changedFiles.add(targetSourceFile);
        }

        let defaultModuleKindResult: TTypescript.EmitResult;
        let emitSkipped: boolean = false;
        for (const moduleKindToEmit of moduleKindsToEmit) {
          const compilerOptions: TTypescript.CompilerOptions = moduleKindToEmit.isPrimary
            ? {
                ...tsconfig.options
              }
            : {
                ...tsconfig.options,
                module: moduleKindToEmit.moduleKind,

                // Don't emit declarations for secondary module kinds
                declaration: false,
                declarationMap: false
              };

          if (!compilerOptions.outDir) {
            throw new InternalError('Expected compilerOptions.outDir to be assigned');
          }

          // Redirect from "path/to/lib" --> "path/to/.heft/build-cache/lib"
          EmitFilesPatch._originalOutDir = compilerOptions.outDir;
          EmitFilesPatch._redirectedOutDir = useBuildCache
            ? moduleKindToEmit.cacheOutFolderPath
            : moduleKindToEmit.outFolderPath;

          const flavorResult: TTypescript.EmitResult = EmitFilesPatch._baseEmitFiles(
            resolver,
            {
              ...host,
              getCompilerOptions: () => compilerOptions
            },
            targetSourceFile,
            ts.getTransformers(compilerOptions, undefined, emitOnlyDtsFiles),
            emitOnlyDtsFiles,
            onlyBuildInfo,
            forceDtsEmit
          );

          emitSkipped = emitSkipped || flavorResult.emitSkipped;
          if (moduleKindToEmit.moduleKind === defaultModuleKind) {
            defaultModuleKindResult = flavorResult;
          }

          EmitFilesPatch._originalOutDir = undefined;
          EmitFilesPatch._redirectedOutDir = undefined;
          // Should results be aggregated, in case for whatever reason the diagnostics are not the same?
        }
        return {
          ...defaultModuleKindResult!,
          emitSkipped
        };
      }
    };
  }

  public static get isInstalled(): boolean {
    return this._patchedTs !== undefined;
  }

  public static getRedirectedFilePath(filePath: string): string {
    if (!EmitFilesPatch.isInstalled) {
      throw new InternalError(
        'EmitFilesPatch.getRedirectedFilePath() cannot be used unless the patch is installed'
      );
    }

    // Redirect from "path/to/lib" --> "path/to/.heft/build-cache/lib"
    let redirectedFilePath: string = filePath;
    if (EmitFilesPatch._redirectedOutDir !== undefined) {
      if (Path.isUnderOrEqual(filePath, EmitFilesPatch._originalOutDir!)) {
        redirectedFilePath = path.resolve(
          EmitFilesPatch._redirectedOutDir,
          path.relative(EmitFilesPatch._originalOutDir!, filePath)
        );
      } else {
        // The compiler is writing some other output, for example:
        // ./.heft/build-cache/ts_a7cd263b9f06b2440c0f2b2264746621c192f2e2.json
      }
    }
    return redirectedFilePath;
  }

  public static uninstall(ts: ExtendedTypeScript): void {
    if (EmitFilesPatch._patchedTs === undefined) {
      throw new InternalError('EmitFilesPatch.uninstall() cannot be called if no patch was installed');
    }
    if (ts !== EmitFilesPatch._patchedTs) {
      throw new InternalError('EmitFilesPatch.uninstall() called for the wrong object');
    }

    ts.emitFiles = EmitFilesPatch._baseEmitFiles;

    EmitFilesPatch._patchedTs = undefined;
    EmitFilesPatch._baseEmitFiles = undefined;
  }
}
