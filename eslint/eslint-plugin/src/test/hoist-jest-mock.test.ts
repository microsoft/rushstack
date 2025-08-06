// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RuleTester } from '@typescript-eslint/rule-tester';

import { getRuleTesterWithProject } from './ruleTester';
import { hoistJestMock } from '../hoist-jest-mock';

const ruleTester: RuleTester = getRuleTesterWithProject();

// These are the CODE_WITH_HOISTING cases from ts-jest's hoist-jest.spec.ts
const INVALID_EXAMPLE_CODE = [
  /* 001 */ "require('foo')",
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

ruleTester.run('hoist-jest-mock', hoistJestMock, {
  invalid: [
    {
      // Detect all the Jest APIs detected by ts-jest
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
    },
    {
      // A simple failure using realistic code
      // prettier-ignore
      code: [
        "const soundPlayer = require('./SoundPlayer');",
        "jest.mock('./SoundPlayer');"
      ].join('\n'),
      errors: [{ messageId: 'error-unhoisted-jest-mock', line: 2 }]
    },
    {
      // Import syntaxes that should fail
      code: ["import x from 'y';", 'jest.mock();'].join('\n'),
      errors: [{ messageId: 'error-unhoisted-jest-mock', line: 2 }]
    },
    // {
    //   // Import syntaxes that should fail
    //   code: ["export { x } from 'y';", 'jest.mock();'].join('\n'),
    //   errors: [{ messageId: 'error-unhoisted-jest-mock', line: 2 }]
    // },
    {
      // Import syntaxes that should fail
      code: ["import * as x from 'y';", 'jest.mock();'].join('\n'),
      errors: [{ messageId: 'error-unhoisted-jest-mock', line: 2 }]
    },
    // {
    //   // Import syntaxes that should fail
    //   code: ["export * from 'y';", 'jest.mock();'].join('\n'),
    //   errors: [{ messageId: 'error-unhoisted-jest-mock', line: 2 }]
    // },
    {
      // Import syntaxes that should fail
      code: ["import 'y';", 'jest.mock();'].join('\n'),
      errors: [{ messageId: 'error-unhoisted-jest-mock', line: 2 }]
    },
    {
      // Import syntaxes that should fail
      code: ["const x = require('package-name');", 'jest.mock();'].join('\n'),
      errors: [{ messageId: 'error-unhoisted-jest-mock', line: 2 }]
    },
    {
      // Import syntaxes that should fail
      code: ["const x = import('package-name');", 'jest.mock();'].join('\n'),
      errors: [{ messageId: 'error-unhoisted-jest-mock', line: 2 }]
    },
    {
      // Import syntaxes that should fail
      code: ["import x = require('package-name');", 'jest.mock();'].join('\n'),
      errors: [{ messageId: 'error-unhoisted-jest-mock', line: 2 }]
    }
  ],
  valid: [
    {
      // A simple success using realistic code
      code: [
        'const mockPlaySoundFile = jest.fn();',
        "jest.mock('./SoundPlayer', () => {",
        '  return {',
        '    SoundPlayer: jest.fn().mockImplementation(() => {',
        '      return { playSoundFile: mockPlaySoundFile };',
        '    })',
        '  };',
        '});'
      ].join('\n')
    }
  ]
});
