// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import type * as ts from 'typescript';

import { PackageJsonLookup } from '@rushstack/node-core-library';

import { TypeScriptInternals } from '../../analyzer/TypeScriptInternals';
import { CompilerState } from '../CompilerState';
import { Extractor, type ExtractorResult } from '../Extractor';
import { ExtractorConfig } from '../ExtractorConfig';

const testDataFolder: string = path.join(__dirname, 'test-data', 'package-name-resolution');

describe('Extractor package name resolution', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    { description: 'disabled', configFileName: 'api-extractor.json' },
    { description: 'enabled', configFileName: 'api-extractor-preserve-symlinks.json' }
  ])('reuses cached package metadata when preserveSymlinks is $description', ({ configFileName }) => {
    const extractorConfig: ExtractorConfig = ExtractorConfig.loadFileAndPrepare(
      path.join(testDataFolder, configFileName)
    );
    const compilerState: CompilerState = CompilerState.create(extractorConfig);
    const program: ts.Program = compilerState.program as ts.Program;
    const packageNamesBySourceFile: ReadonlyMap<ts.SourceFile, string> =
      TypeScriptInternals.getPackageNamesBySourceFile(program);

    expect(
      packageNamesBySourceFile.get(
        _getSourceFile(program, ['@microsoft', 'tsdoc', 'lib-commonjs', 'beta', 'DeclarationReference.d.ts'])
      )
    ).toBe('@microsoft/tsdoc');
    expect(packageNamesBySourceFile.get(_getSourceFile(program, ['@types', 'resolve', 'index.d.ts']))).toBe(
      '@types/resolve'
    );
    expect(packageNamesBySourceFile.get(_getSourceFile(program, ['@types', 'semver', 'index.d.ts']))).toBe(
      '@types/semver'
    );

    const packageJsonLookupSpy: jest.SpiedFunction<PackageJsonLookup['tryLoadNodePackageJsonFor']> =
      jest.spyOn(PackageJsonLookup.prototype, 'tryLoadNodePackageJsonFor');

    const extractorResult: ExtractorResult = Extractor.invoke(extractorConfig, {
      compilerState,
      localBuild: true
    });

    expect(extractorResult.succeeded).toBe(true);
    expect(_getDeclarationReferenceLookupCalls(packageJsonLookupSpy)).toHaveLength(0);
  });

  it('falls back to package.json lookup when resolution metadata is unavailable', () => {
    const extractorConfig: ExtractorConfig = ExtractorConfig.loadFileAndPrepare(
      path.join(testDataFolder, 'api-extractor.json')
    );
    const compilerState: CompilerState = CompilerState.create(extractorConfig);
    jest.spyOn(TypeScriptInternals, 'getPackageNamesBySourceFile').mockReturnValue(new Map());
    const packageJsonLookupSpy: jest.SpiedFunction<PackageJsonLookup['tryLoadNodePackageJsonFor']> =
      jest.spyOn(PackageJsonLookup.prototype, 'tryLoadNodePackageJsonFor');

    const extractorResult: ExtractorResult = Extractor.invoke(extractorConfig, {
      compilerState,
      localBuild: true
    });

    expect(extractorResult.succeeded).toBe(true);
    expect(_getDeclarationReferenceLookupCalls(packageJsonLookupSpy)).toHaveLength(1);
  });
});

function _getSourceFile(program: ts.Program, pathSegments: string[]): ts.SourceFile {
  const fileNameSuffix: string = path.join(...pathSegments);
  const sourceFile: ts.SourceFile | undefined = program
    .getSourceFiles()
    .find(({ fileName }) => fileName.endsWith(fileNameSuffix));

  if (!sourceFile) {
    throw new Error(`Unable to find source file ending with: ${fileNameSuffix}`);
  }

  return sourceFile;
}

function _getDeclarationReferenceLookupCalls(
  packageJsonLookupSpy: jest.SpiedFunction<PackageJsonLookup['tryLoadNodePackageJsonFor']>
): unknown[][] {
  const declarationReferencePathSuffix: string = path.join(
    '@microsoft',
    'tsdoc',
    'lib-commonjs',
    'beta',
    'DeclarationReference.d.ts'
  );

  return packageJsonLookupSpy.mock.calls.filter(([filePath]) =>
    filePath.endsWith(declarationReferencePathSuffix)
  );
}
