// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as ts from 'typescript';

import { type IGlobalVariableAnalyzer, TypeScriptInternals } from '../TypeScriptInternals';

/**
 * Builds a minimal in-memory `ts.Program` whose global scope is populated from the bundled
 * compiler's real `lib.*.d.ts` files, without needing on-disk fixtures.
 */
function createInMemoryProgram(sourceText: string): ts.Program {
  const rootFileName: string = 'index.ts';
  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ESNext,
    // Load the standard globals: lib.es5 declares Array/Object, lib.es2015 adds Promise/Map.  es5 is
    // listed explicitly so the assertions don't depend on es2015's transitive reference to it.
    lib: ['lib.es5.d.ts', 'lib.es2015.d.ts'],
    noLib: false,
    types: []
  };

  // Start from a real CompilerHost so that lib file resolution/reads use the bundled compiler,
  // then override only the root source file to keep the program self-contained.
  const host: ts.CompilerHost = ts.createCompilerHost(compilerOptions);
  const rootSourceFile: ts.SourceFile = ts.createSourceFile(
    rootFileName,
    sourceText,
    ts.ScriptTarget.ESNext,
    /*setParentNodes*/ true
  );

  const defaultGetSourceFile: ts.CompilerHost['getSourceFile'] = host.getSourceFile.bind(host);
  const defaultFileExists: ts.CompilerHost['fileExists'] = host.fileExists.bind(host);
  const defaultReadFile: ts.CompilerHost['readFile'] = host.readFile.bind(host);

  host.getSourceFile = (fileName, languageVersionOrOptions, onError, shouldCreateNewSourceFile) => {
    if (fileName === rootFileName) {
      return rootSourceFile;
    }
    return defaultGetSourceFile(fileName, languageVersionOrOptions, onError, shouldCreateNewSourceFile);
  };
  host.fileExists = (fileName) => fileName === rootFileName || defaultFileExists(fileName);
  host.readFile = (fileName) => (fileName === rootFileName ? sourceText : defaultReadFile(fileName));

  const program: ts.Program = ts.createProgram([rootFileName], compilerOptions, host);

  // Self-validate the fixture: a clean program means the libs and root file resolved, so a future
  // misconfiguration fails loudly here instead of silently emptying the global table.
  expect(ts.getPreEmitDiagnostics(program)).toHaveLength(0);

  return program;
}

describe(TypeScriptInternals.name, () => {
  describe(TypeScriptInternals.getGlobalVariableAnalyzer.name, () => {
    // Guards the getTypeChecker -> getEmitResolver -> hasGlobalName chain against *semantic* drift:
    // the methods can survive a compiler bump but stop populating the global table (the InternalError
    // guards in TypeScriptInternals only catch their outright removal).
    it('reports ambient globals as global names', () => {
      const program: ts.Program = createInMemoryProgram('export const value: number = 1;');
      const analyzer: IGlobalVariableAnalyzer = TypeScriptInternals.getGlobalVariableAnalyzer(program);

      expect(analyzer.hasGlobalName('Array')).toBe(true);
      expect(analyzer.hasGlobalName('Object')).toBe(true);
      expect(analyzer.hasGlobalName('Promise')).toBe(true);
    });

    it('does not report arbitrary identifiers as global names', () => {
      const program: ts.Program = createInMemoryProgram('export const value: number = 1;');
      const analyzer: IGlobalVariableAnalyzer = TypeScriptInternals.getGlobalVariableAnalyzer(program);

      expect(analyzer.hasGlobalName('__this_is_definitely_not_a_global_name__')).toBe(false);
      expect(analyzer.hasGlobalName('value')).toBe(false);
    });
  });
});
