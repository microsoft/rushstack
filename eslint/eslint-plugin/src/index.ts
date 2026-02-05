// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { TSESLint } from '@typescript-eslint/utils';
import type { Linter } from 'eslint';

import { hoistJestMock } from './hoist-jest-mock';
import { noBackslashImportsRule } from './no-backslash-imports';
import { noExternalLocalImportsRule } from './no-external-local-imports';
import { noNewNullRule } from './no-new-null';
import { noNullRule } from './no-null';
import { noTransitiveDependencyImportsRule } from './no-transitive-dependency-imports';
import { noUntypedUnderscoreRule } from './no-untyped-underscore';
import { normalizedImportsRule } from './normalized-imports';
import { typedefVar } from './typedef-var';
import { importRequiresChunkNameRule } from './import-requires-chunk-name';
import { pairReactDomRenderUnmountRule } from './pair-react-dom-render-unmount';
import { sortPackageJsonProcessor } from './sort-package-json';

interface IPlugin {
  rules: { [ruleName: string]: TSESLint.RuleModule<string, unknown[]> };
  processors: { [processorName: string]: Linter.Processor };
}

const plugin: IPlugin = {
  rules: {
    // Full name: "@rushstack/hoist-jest-mock"
    'hoist-jest-mock': hoistJestMock,

    // Full name: "@rushstack/no-backslash-imports"
    'no-backslash-imports': noBackslashImportsRule,

    // Full name: "@rushstack/no-external-local-imports"
    'no-external-local-imports': noExternalLocalImportsRule,

    // Full name: "@rushstack/no-new-null"
    'no-new-null': noNewNullRule,

    // Full name: "@rushstack/no-null"
    'no-null': noNullRule,

    // Full name: "@rushstack/no-transitive-dependency-imports"
    'no-transitive-dependency-imports': noTransitiveDependencyImportsRule,

    // Full name: "@rushstack/no-untyped-underscore"
    'no-untyped-underscore': noUntypedUnderscoreRule,

    // Full name: "@rushstack/normalized-imports"
    'normalized-imports': normalizedImportsRule,

    // Full name: "@rushstack/typedef-var"
    'typedef-var': typedefVar,

    // Full name: "@rushstack/import-requires-chunk-name"
    'import-requires-chunk-name': importRequiresChunkNameRule,

    // Full name: "@rushstack/pair-react-dom-render-unmount"
    'pair-react-dom-render-unmount': pairReactDomRenderUnmountRule
  },

  processors: {
    'sort-package-json': sortPackageJsonProcessor
  }
};

export = plugin;
