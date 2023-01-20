// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { InternalError } from '@rushstack/node-core-library';
import type * as TTypescript from 'typescript';
import {
  ExtendedTypeScript,
  IEmitResolver,
  IEmitHost,
  IEmitTransformers
} from './internalTypings/TypeScriptInternals';

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
}

export class EmitFilesPatch {
  private static _patchedTs: ExtendedTypeScript | undefined = undefined;

  private static _baseEmitFiles: any | undefined = undefined; // eslint-disable-line

  public static install(
    ts: ExtendedTypeScript,
    baseCompilerOptions: TTypescript.CompilerOptions,
    moduleKindsToEmit: ICachedEmitModuleKind[],
    changedFiles?: Set<TTypescript.SourceFile>
  ): void {
    if (EmitFilesPatch._patchedTs === ts) {
      // We already patched this instance of TS
      return;
    }

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

    const patchedEmitFiles = (
      resolver: IEmitResolver,
      host: IEmitHost,
      targetSourceFile: TTypescript.SourceFile | undefined,
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
        const diagnostics: TTypescript.Diagnostic[] = [];
        let emitSkipped: boolean = false;
        for (const moduleKindToEmit of moduleKindsToEmit) {
          const compilerOptions: TTypescript.CompilerOptions = moduleKindToEmit.isPrimary
            ? {
                ...baseCompilerOptions
              }
            : {
                ...baseCompilerOptions,
                module: moduleKindToEmit.moduleKind,
                outDir: moduleKindToEmit.outFolderPath,

                // Don't emit declarations for secondary module kinds
                declaration: false,
                declarationMap: false
              };

          if (!compilerOptions.outDir) {
            throw new InternalError('Expected compilerOptions.outDir to be assigned');
          }

          const flavorResult: TTypescript.EmitResult = EmitFilesPatch._baseEmitFiles(
            resolver,
            {
              ...host,
              writeFile: EmitFilesPatch.wrapWriteFile(host.writeFile, moduleKindToEmit.jsExtensionOverride),
              getCompilerOptions: () => compilerOptions
            },
            targetSourceFile,
            ts.getTransformers(compilerOptions, undefined, emitOnlyDtsFiles),
            emitOnlyDtsFiles,
            onlyBuildInfo,
            forceDtsEmit
          );

          emitSkipped = emitSkipped || flavorResult.emitSkipped;
          for (const diagnostic of flavorResult.diagnostics) {
            diagnostics.push(diagnostic);
          }

          if (moduleKindToEmit.moduleKind === defaultModuleKind) {
            defaultModuleKindResult = flavorResult;
          }
          // Should results be aggregated, in case for whatever reason the diagnostics are not the same?
        }

        const mergedDiagnostics: readonly TTypescript.Diagnostic[] =
          ts.sortAndDeduplicateDiagnostics(diagnostics);

        return {
          ...defaultModuleKindResult!,
          diagnostics: mergedDiagnostics,
          emitSkipped
        };
      }
    };

    // Override the underlying file emitter to run itself once for each flavor
    // This is a rather inelegant way to convince the TypeScript compiler not to duplicate parse/link/check
    ts.emitFiles = patchedEmitFiles;
  }

  public static get isInstalled(): boolean {
    return this._patchedTs !== undefined;
  }

  /**
   * Wraps the writeFile callback on the IEmitHost to override the .js extension, if applicable
   */
  public static wrapWriteFile(
    baseWriteFile: TTypescript.WriteFileCallback,
    jsExtensionOverride: string | undefined
  ): TTypescript.WriteFileCallback {
    if (!jsExtensionOverride) {
      return baseWriteFile;
    }

    const replacementExtension: string = `${jsExtensionOverride}$1`;
    return (
      fileName: string,
      data: string,
      writeBOM: boolean,
      onError?: ((message: string) => void) | undefined,
      sourceFiles?: readonly TTypescript.SourceFile[] | undefined
    ) => {
      return baseWriteFile(
        fileName.replace(/\.js(\.map)?$/g, replacementExtension),
        data,
        writeBOM,
        onError,
        sourceFiles
      );
    };
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
