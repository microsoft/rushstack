// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CompilerOptions } from 'typescript';
import { PackletAnalyzer } from '../PackletAnalyzer';

describe('PacketAnalyzer', () => {
  describe('with tsconfig compilerOptions.paths specified', () => {
    const projectPath = '/path/to/my-project';
    const filepath = `${projectPath}/src/packlets/metrics/stat.ts`;
    const compilerOptions: CompilerOptions = {
      configFilePath: `${projectPath}/tsconfig.json`,
      paths: {
        '@legacy/*': ['app/*'],
        '@config': ['config'],
        '@myorg/packlets/*': ['src/packlets/*'],
        jquery: ['node_modules/jquery/dist/jquery']
      }
    };
    const packletAnalyzer = PackletAnalyzer.analyzeInputFile(filepath, compilerOptions);
    test('.isModulePathAnAlias', () => {
      expect(packletAnalyzer.nothingToDo).toEqual(false);
      expect(packletAnalyzer.isModulePathAnAlias('@myorg/packlets/logging')).toEqual(false);
      expect(packletAnalyzer.isModulePathAnAlias('jquery')).toEqual(false);
      expect(packletAnalyzer.isModulePathAnAlias('@legacy')).toEqual(true);
      expect(packletAnalyzer.isModulePathAnAlias('@legacy-')).toEqual(false);
      expect(packletAnalyzer.isModulePathAnAlias('@config')).toEqual(true);
      expect(packletAnalyzer.isModulePathAnAlias('@legacy/service')).toEqual(true);
    });
  });
});
