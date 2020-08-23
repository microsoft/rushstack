// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ESLintUtils } from '@typescript-eslint/experimental-utils';
import { hoistJestMock } from './hoist-jest-mock';

const { RuleTester } = ESLintUtils;
const ruleTester = new RuleTester({
  parser: '@typescript-eslint/parser'
});

// These are the CODE_WITH_HOISTING cases from ts-jest's hoist-jest.spec.ts
const INVALID_EXAMPLE_CODE = [
  /* 001 */ "const foo = 'foo'",
  /* 002 */ 'console.log(foo)',
  /* 003 */ 'jest.enableAutomock()',
  /* 004 */ 'jest.disableAutomock()',
  /* 005 */ "jest.mock('./foo')",
  /* 006 */ "jest.mock('./foo/bar', () => 'bar')",
  /* 007 */ "jest.unmock('./bar/foo').dontMock('./bar/bar')",
  /* 008 */ "jest.deepUnmock('./foo')",
  /* 009 */ "jest.mock('./foo').mock('./bar')",
  /* 010 */ 'const func = () => {',
  /* 011 */ "  const bar = 'bar'",
  /* 012 */ '  console.log(bar)',
  /* 013 */ "  jest.unmock('./foo')",
  /* 014 */ "  jest.mock('./bar')",
  /* 015 */ "  jest.mock('./bar/foo', () => 'foo')",
  /* 016 */ "  jest.unmock('./foo/bar')",
  /* 017 */ "  jest.unmock('./bar/foo').dontMock('./bar/bar')",
  /* 018 */ "  jest.deepUnmock('./bar')",
  /* 019 */ "  jest.mock('./foo').mock('./bar')",
  /* 020 */ '}',
  /* 021 */ 'const func2 = () => {',
  /* 022 */ "  const bar = 'bar'",
  /* 023 */ '  console.log(bar)',
  /* 024 */ "  jest.mock('./bar')",
  /* 025 */ "  jest.unmock('./foo/bar')",
  /* 026 */ "  jest.mock('./bar/foo', () => 'foo')",
  /* 027 */ "  jest.unmock('./foo')",
  /* 028 */ "  jest.unmock('./bar/foo').dontMock('./bar/bar')",
  /* 029 */ "  jest.deepUnmock('./bar')",
  /* 030 */ "  jest.mock('./foo').mock('./bar')",
  /* 031 */ '}'
].join('\n');

const VALID_EXAMPLE_CODE = [
  /* 001 */ 'jest.enableAutomock()',
  /* 002 */ 'jest.disableAutomock()',
  /* 003 */ "jest.mock('./foo')",
  /* 004 */ "jest.mock('./foo/bar', () => 'bar')",
  /* 005 */ "jest.unmock('./bar/foo').dontMock('./bar/bar')",
  /* 006 */ "jest.deepUnmock('./foo')",
  /* 007 */ "jest.mock('./foo').mock('./bar')",
  /* 008 */ "const foo = 'foo'",
  /* 009 */ 'console.log(foo)',
  /* 010 */ 'const func = () => {',
  /* 011 */ "  jest.unmock('./foo')",
  /* 012 */ "  jest.mock('./bar')",
  /* 013 */ "  jest.mock('./bar/foo', () => 'foo')",
  /* 014 */ "  jest.unmock('./foo/bar')",
  /* 015 */ "  jest.unmock('./bar/foo').dontMock('./bar/bar')",
  /* 016 */ "  jest.deepUnmock('./bar')",
  /* 017 */ "  jest.mock('./foo').mock('./bar')",
  /* 018 */ "  const bar = 'bar'",
  /* 019 */ '  console.log(bar)',
  /* 020 */ '}',
  /* 021 */ 'const func2 = () => {',
  /* 022 */ "  jest.mock('./bar')",
  /* 023 */ "  jest.unmock('./foo/bar')",
  /* 024 */ "  jest.mock('./bar/foo', () => 'foo')",
  /* 025 */ "  jest.unmock('./foo')",
  /* 026 */ "  jest.unmock('./bar/foo').dontMock('./bar/bar')",
  /* 027 */ "  jest.deepUnmock('./bar')",
  /* 038 */ "  jest.mock('./foo').mock('./bar')",
  /* 029 */ "  const bar = 'bar'",
  /* 030 */ '  console.log(bar)',
  /* 031 */ '}'
].join('\n');

ruleTester.run('hoist-jest-mock', hoistJestMock, {
  invalid: [
    {
      code: INVALID_EXAMPLE_CODE,
      errors: [
        { messageId: 'error-unhoisted-jest-mock', line: 3 },
        { messageId: 'error-unhoisted-jest-mock', line: 4 },
        { messageId: 'error-unhoisted-jest-mock', line: 5 },
        { messageId: 'error-unhoisted-jest-mock', line: 6 },
        { messageId: 'error-unhoisted-jest-mock', line: 7 },
        { messageId: 'error-unhoisted-jest-mock', line: 8 },
        { messageId: 'error-unhoisted-jest-mock', line: 9 },

        { messageId: 'error-unhoisted-jest-mock', line: 13 },
        { messageId: 'error-unhoisted-jest-mock', line: 14 },
        { messageId: 'error-unhoisted-jest-mock', line: 15 },
        { messageId: 'error-unhoisted-jest-mock', line: 16 },
        { messageId: 'error-unhoisted-jest-mock', line: 17 },
        { messageId: 'error-unhoisted-jest-mock', line: 18 },
        { messageId: 'error-unhoisted-jest-mock', line: 19 },

        { messageId: 'error-unhoisted-jest-mock', line: 24 },
        { messageId: 'error-unhoisted-jest-mock', line: 25 },
        { messageId: 'error-unhoisted-jest-mock', line: 26 },
        { messageId: 'error-unhoisted-jest-mock', line: 27 },
        { messageId: 'error-unhoisted-jest-mock', line: 28 },
        { messageId: 'error-unhoisted-jest-mock', line: 29 },
        { messageId: 'error-unhoisted-jest-mock', line: 30 }
      ]
    }
  ],
  valid: [{ code: VALID_EXAMPLE_CODE }]
});
