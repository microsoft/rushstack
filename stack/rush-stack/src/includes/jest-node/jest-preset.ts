// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.
/// <reference types='jest' />

import {
  ConsoleTerminalProvider,
  PackageJsonLookup
} from '@microsoft/node-core-library';

import { CompilerResolver } from '../../logic/CompilerResolver';

const compilerResolver: CompilerResolver = new CompilerResolver({
  terminalProvider: new ConsoleTerminalProvider(),
  projectPath: process.cwd()
});

const packageResolver: PackageJsonLookup = new PackageJsonLookup();
const tsJestPath: string | undefined = packageResolver.tryGetPackageFolderFor(require.resolve('ts-jest'));
if (!tsJestPath) {
  throw new Error('Unable to find package ts-jest');
}

const config: Partial<jest.InitialOptions> = {
  verbose: true,
  moduleFileExtensions: [
    'ts',
    'tsx',
    'js',
    'jsx'
  ],
  transform: {
    '^.+\\.tsx?$': tsJestPath
  },
  testMatch: [
    '<rootDir>/src/**/*.test.ts'
  ],
  globals: {
    'ts-jest': {
      'compiler': compilerResolver.initializeRushStackCompiler().ToolPaths.typescriptPackagePath
    }
  },
  moduleNameMapper: {
    'ts-jest': tsJestPath
  }
};

module.exports = config;
