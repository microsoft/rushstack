// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as TTypescript from 'typescript';

import { InternalError } from '@rushstack/node-core-library';

import type { ExtendedTypeScript } from './internalTypings/TypeScriptInternals.ts';
import type { ICachedEmitModuleKind } from './types.ts';

// symbols for attaching hidden metadata to ts.Program instances.
const INNER_GET_COMPILER_OPTIONS_SYMBOL: unique symbol = Symbol('getCompilerOptions');
const INNER_EMIT_SYMBOL: unique symbol = Symbol('emit');

const JS_EXTENSION_REGEX: RegExp = /\.js(\.map)?$/;

/**
 * Regex to match relative import/require specifiers ending in `.js` within compiled JS output.
 * Captures: full match with quotes and `.js`, group 1 = the relative path without `.js`.
 * Used to rewrite `.js` → `.cjs`/`.mjs` when jsExtensionOverride is set.
 */
const RELATIVE_JS_SPECIFIER_REGEX: RegExp = /(?<=(?:from|require\(|import\()\s*['"])(\.[^'"]*?)\.js(?=['"])/g;

function wrapWriteFile(
  this: void,
  baseWriteFile: TTypescript.WriteFileCallback,
  jsExtensionOverride: string | undefined
): TTypescript.WriteFileCallback {
  if (!jsExtensionOverride) {
    return baseWriteFile;
  }

  const fileReplacementExtension: string = `${jsExtensionOverride}$1`;

  return (
    fileName: string,
    data: string,
    writeBOM: boolean,
    onError?: ((message: string) => void) | undefined,
    sourceFiles?: readonly TTypescript.SourceFile[] | undefined
  ) => {
    fileName = fileName.replace(JS_EXTENSION_REGEX, fileReplacementExtension);

    // When jsExtensionOverride is set (e.g., `.cjs` or `.mjs`), also rewrite `.js` extensions
    // in relative import/require specifiers within the file content. This is necessary because
    // TypeScript's rewriteRelativeImportExtensions always rewrites `.ts` → `.js`, regardless
    // of the actual output extension. Without this, a `.cjs` file would contain
    // `require("./foo.js")` pointing to an ESM `.js` file instead of `require("./foo.cjs")`.
    if (!fileName.endsWith('.map')) {
      data = data.replace(RELATIVE_JS_SPECIFIER_REGEX, `$1${jsExtensionOverride}`);
    }

    return baseWriteFile(fileName, data, writeBOM, onError, sourceFiles);
  };
}

export function configureProgramForMultiEmit(
  this: void,
  innerProgram: TTypescript.Program,
  ts: ExtendedTypeScript,
  moduleKindsToEmit: ICachedEmitModuleKind[],
  mode: 'transpile' | 'declaration' | 'both'
): { changedFiles: Set<TTypescript.SourceFile> } {
  interface IProgramWithMultiEmit extends TTypescript.Program {
    // Attach the originals to the Program instance to avoid modifying the same Program twice.
    // Don't use WeakMap because this Program could theoretically get a { ... } applied to it.
    [INNER_GET_COMPILER_OPTIONS_SYMBOL]?: TTypescript.Program['getCompilerOptions'];
    [INNER_EMIT_SYMBOL]?: // There is a "forceDtsEmit" parameter that is not on the published types. // https://github.com/microsoft/TypeScript/blob/88cb76d314a93937ce8d9543114ccbad993be6d1/src/compiler/program.ts#L2697-L2698
    (...args: [...Parameters<TTypescript.Program['emit']>, boolean | undefined]) => TTypescript.EmitResult;
  }

  const program: IProgramWithMultiEmit = innerProgram;

  // Check to see if this Program has already been modified.
  let { [INNER_EMIT_SYMBOL]: innerEmit, [INNER_GET_COMPILER_OPTIONS_SYMBOL]: innerGetCompilerOptions } =
    program;

  if (!innerGetCompilerOptions) {
    program[INNER_GET_COMPILER_OPTIONS_SYMBOL] = innerGetCompilerOptions = program.getCompilerOptions;
  }

  if (!innerEmit) {
    program[INNER_EMIT_SYMBOL] = innerEmit = program.emit;
  }

  let foundPrimary: boolean = false;
  let defaultModuleKind: TTypescript.ModuleKind;

  const multiEmitMap: Map<ICachedEmitModuleKind, TTypescript.CompilerOptions> = new Map();
  for (const moduleKindToEmit of moduleKindsToEmit) {
    const kindCompilerOptions: TTypescript.CompilerOptions = moduleKindToEmit.isPrimary
      ? {
          ...innerGetCompilerOptions()
        }
      : {
          ...innerGetCompilerOptions(),
          module: moduleKindToEmit.moduleKind,
          outDir: moduleKindToEmit.outFolderPath,

          // Don't emit declarations for secondary module kinds
          declaration: false,
          declarationMap: false
        };
    if (!kindCompilerOptions.outDir) {
      throw new InternalError('Expected compilerOptions.outDir to be assigned');
    }
    if (mode === 'transpile') {
      kindCompilerOptions.declaration = false;
      kindCompilerOptions.declarationMap = false;
    } else if (mode === 'declaration') {
      kindCompilerOptions.emitDeclarationOnly = true;
    }

    if (moduleKindToEmit.isPrimary || mode !== 'declaration') {
      multiEmitMap.set(moduleKindToEmit, kindCompilerOptions);
    }

    if (moduleKindToEmit.isPrimary) {
      if (foundPrimary) {
        throw new Error('Multiple primary module emit kinds encountered.');
      } else {
        foundPrimary = true;
      }

      defaultModuleKind = moduleKindToEmit.moduleKind;
    }
  }

  const changedFiles: Set<TTypescript.SourceFile> = new Set();

  program.emit = (
    targetSourceFile?: TTypescript.SourceFile,
    writeFile?: TTypescript.WriteFileCallback,
    cancellationToken?: TTypescript.CancellationToken,
    emitOnlyDtsFiles?: boolean,
    customTransformers?: TTypescript.CustomTransformers,
    forceDtsEmit?: boolean
  ) => {
    if (emitOnlyDtsFiles) {
      return program[INNER_EMIT_SYMBOL]!(
        targetSourceFile,
        writeFile,
        cancellationToken,
        emitOnlyDtsFiles,
        customTransformers,
        forceDtsEmit
      );
    }

    if (targetSourceFile && changedFiles) {
      changedFiles.add(targetSourceFile);
    }

    const originalCompilerOptions: TTypescript.CompilerOptions =
      program[INNER_GET_COMPILER_OPTIONS_SYMBOL]!();

    let defaultModuleKindResult: TTypescript.EmitResult;
    const diagnostics: TTypescript.Diagnostic[] = [];
    let emitSkipped: boolean = false;
    try {
      for (const [moduleKindToEmit, kindCompilerOptions] of multiEmitMap) {
        program.getCompilerOptions = () => kindCompilerOptions;
        // Need to mutate the compiler options for the `module` field specifically, because emitWorker() captures
        // options in the closure and passes it to `ts.getTransformers()`
        originalCompilerOptions.module = moduleKindToEmit.moduleKind;
        const flavorResult: TTypescript.EmitResult = program[INNER_EMIT_SYMBOL]!(
          targetSourceFile,
          writeFile && wrapWriteFile(writeFile, moduleKindToEmit.jsExtensionOverride),
          cancellationToken,
          emitOnlyDtsFiles,
          customTransformers,
          forceDtsEmit
        );

        emitSkipped = emitSkipped || flavorResult.emitSkipped;
        // Need to aggregate diagnostics because some are impacted by the target module type
        for (const diagnostic of flavorResult.diagnostics) {
          diagnostics.push(diagnostic);
        }

        if (moduleKindToEmit.moduleKind === defaultModuleKind) {
          defaultModuleKindResult = flavorResult;
        }
      }

      const mergedDiagnostics: readonly TTypescript.Diagnostic[] =
        ts.sortAndDeduplicateDiagnostics(diagnostics);

      return {
        ...defaultModuleKindResult!,
        changedSourceFiles: changedFiles,
        diagnostics: mergedDiagnostics,
        emitSkipped
      };
    } finally {
      // Restore the original compiler options and module kind for future calls
      program.getCompilerOptions = program[INNER_GET_COMPILER_OPTIONS_SYMBOL]!;
      originalCompilerOptions.module = defaultModuleKind;
    }
  };
  return { changedFiles };
}
