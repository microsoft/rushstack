// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RuleTester } from '@typescript-eslint/rule-tester';

import { getRuleTesterWithProject } from './ruleTester';
import { hoistJestMock } from '../hoist-jest-mock';

const ruleTester: RuleTester = getRuleTesterWithProject();

// Helper function to sanitize newlines in the output
function sanitizeNewLineAtEnd(lines: string[]): string[] {
  if (lines.length !== 0) {
    // console.log('last line', lines[lines.length - 1]);
    // lines[lines.length - 1] = lines[lines.length - 1].replace(/\n+$/, '');
    // lines.push('');
  }

  return lines;
}

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
    // {
    //   // Detect all the Jest APIs detected by ts-jest
    //   code: INVALID_EXAMPLE_CODE,
    //   errors: [
    //     { messageId: 'error-unhoisted-jest-mock', line: 3 },
    //     { messageId: 'error-unhoisted-jest-mock', line: 4 },
    //     { messageId: 'error-unhoisted-jest-mock', line: 5 },
    //     { messageId: 'error-unhoisted-jest-mock', line: 6 },
    //     { messageId: 'error-unhoisted-jest-mock', line: 7 },
    //     { messageId: 'error-unhoisted-jest-mock', line: 8 },
    //     { messageId: 'error-unhoisted-jest-mock', line: 9 },

    //     { messageId: 'error-unhoisted-jest-mock', line: 13 },
    //     { messageId: 'error-unhoisted-jest-mock', line: 14 },
    //     { messageId: 'error-unhoisted-jest-mock', line: 15 },
    //     { messageId: 'error-unhoisted-jest-mock', line: 16 },
    //     { messageId: 'error-unhoisted-jest-mock', line: 17 },
    //     { messageId: 'error-unhoisted-jest-mock', line: 18 },
    //     { messageId: 'error-unhoisted-jest-mock', line: 19 },

    //     { messageId: 'error-unhoisted-jest-mock', line: 24 },
    //     { messageId: 'error-unhoisted-jest-mock', line: 25 },
    //     { messageId: 'error-unhoisted-jest-mock', line: 26 },
    //     { messageId: 'error-unhoisted-jest-mock', line: 27 },
    //     { messageId: 'error-unhoisted-jest-mock', line: 28 },
    //     { messageId: 'error-unhoisted-jest-mock', line: 29 },
    //     { messageId: 'error-unhoisted-jest-mock', line: 30 }
    //   ]
    // },
    {
      // A simple failure using realistic code
      // prettier-ignore
      code: [
        "const soundPlayer = require('./SoundPlayer');",
        "jest.mock('./SoundPlayer');"
      ].join('\n'),
      errors: [{ messageId: 'error-unhoisted-jest-mock', line: 2 }],
      output: ["jest.mock('./SoundPlayer');", "const soundPlayer = require('./SoundPlayer');"].join('\n')
    },
    {
      // multi line jest.mock with variable reference.
      // moves only jest.mock
      // variable will be hoisted during execution
      // prettier-ignore
      code: [
        "import x from 'y';",
        'const mockPlaySoundFile = jest.fn();',
        "jest.mock('./SoundPlayer', () => {",
        '  return {',
        '    SoundPlayer: jest.fn().mockImplementation(() => {',
        '      return { playSoundFile: mockPlaySoundFile };',
        '    })',
        '  };',
        '});'
      ].join('\n'),
      errors: [{ messageId: 'error-unhoisted-jest-mock', line: 3 }],
      output: [
        "jest.mock('./SoundPlayer', () => {",
        '  return {',
        '    SoundPlayer: jest.fn().mockImplementation(() => {',
        '      return { playSoundFile: mockPlaySoundFile };',
        '    })',
        '  };',
        '});',
        "import x from 'y';",
        'const mockPlaySoundFile = jest.fn();'
      ].join('\n')
    },
    // multi line jest.mock with require in mock implementation
    {
      code: [
        "import x from 'y';",
        'const mockPlaySoundFile = jest.fn();',
        "jest.mock('../assets/moduleSvg', () => {",
        "  const React = require('react')",
        '  return {',
        '    __esModule: true,',
        '    default: () => "testSVG",',
        '  }',
        '})',
        "jest.mock('./SoundPlayer', () => {",
        '  return {',
        '    SoundPlayer: jest.fn().mockImplementation(() => {',
        '      return { playSoundFile: mockPlaySoundFile };',
        '    })',
        '  };',
        '});'
      ].join('\n'),
      errors: [
        { messageId: 'error-unhoisted-jest-mock', line: 3 },
        { messageId: 'error-unhoisted-jest-mock', line: 10 }
      ],
      output: [
        [
          "jest.mock('../assets/moduleSvg', () => {",
          "  const React = require('react')",
          '  return {',
          '    __esModule: true,',
          '    default: () => "testSVG",',
          '  }',
          '})',
          "import x from 'y';",
          'const mockPlaySoundFile = jest.fn();',
          "jest.mock('./SoundPlayer', () => {",
          '  return {',
          '    SoundPlayer: jest.fn().mockImplementation(() => {',
          '      return { playSoundFile: mockPlaySoundFile };',
          '    })',
          '  };',
          '});'
        ].join('\n'),
        [
          "jest.mock('../assets/moduleSvg', () => {",
          "  const React = require('react')",
          '  return {',
          '    __esModule: true,',
          '    default: () => "testSVG",',
          '  }',
          '})',
          "jest.mock('./SoundPlayer', () => {",
          '  return {',
          '    SoundPlayer: jest.fn().mockImplementation(() => {',
          '      return { playSoundFile: mockPlaySoundFile };',
          '    })',
          '  };',
          '});',
          "import x from 'y';",
          'const mockPlaySoundFile = jest.fn();'
        ].join('\n')
      ]
    },
    {
      // Import syntaxes that should fail
      code: ["import x from 'y';", 'jest.mock();'].join('\n'),
      errors: [{ messageId: 'error-unhoisted-jest-mock', line: 2 }],
      output: sanitizeNewLineAtEnd(['jest.mock();', "import x from 'y';"]).join('\n')
    },
    {
      // Import syntaxes with destructured import that should fail
      code: ['import { x,', 'y,', 'z,', " } from 'y';", 'jest.mock();'].join('\n'),
      errors: [{ messageId: 'error-unhoisted-jest-mock', line: 5 }],
      output: sanitizeNewLineAtEnd(['jest.mock();', 'import { x,', 'y,', 'z,', " } from 'y';"]).join('\n')
    },
    {
      // Import syntaxes that should fail
      code: ["import * as x from 'y';", 'jest.mock();'].join('\n'),
      errors: [{ messageId: 'error-unhoisted-jest-mock', line: 2 }],
      output: sanitizeNewLineAtEnd(['jest.mock();', "import * as x from 'y';"]).join('\n')
    },
    {
      // Import syntaxes that should fail
      code: ["import 'y';", 'jest.mock();'].join('\n'),
      errors: [{ messageId: 'error-unhoisted-jest-mock', line: 2 }],
      output: sanitizeNewLineAtEnd(['jest.mock();', "import 'y';"]).join('\n')
    },
    {
      // Import syntaxes that should fail
      code: ["const x = require('package-name');", 'jest.mock();'].join('\n'),
      errors: [{ messageId: 'error-unhoisted-jest-mock', line: 2 }],
      output: sanitizeNewLineAtEnd(['jest.mock();', "const x = require('package-name');"]).join('\n')
    },
    {
      // Import syntaxes that should fail
      code: ["const x = import('package-name');", 'jest.mock();'].join('\n'),
      errors: [{ messageId: 'error-unhoisted-jest-mock', line: 2 }],
      output: sanitizeNewLineAtEnd(['jest.mock();', "const x = import('package-name');"]).join('\n')
    },
    {
      // Import syntaxes that should fail
      code: ["import x = require('package-name');", 'jest.mock();'].join('\n'),
      errors: [{ messageId: 'error-unhoisted-jest-mock', line: 2 }],
      output: sanitizeNewLineAtEnd(['jest.mock();', "import x = require('package-name');"]).join('\n')
    },
    {
      // Test multiple jest.mock calls
      // The fix will move jest.mock one at a time.
      // Hence we may need to run multiple passes to get the correct output.
      code: ["import x from 'x';", "jest.mock('./a');", "jest.mock('./b');", "import y from 'y';"].join('\n'),
      errors: [
        { messageId: 'error-unhoisted-jest-mock', line: 2 },
        { messageId: 'error-unhoisted-jest-mock', line: 3 }
      ],
      output: [
        sanitizeNewLineAtEnd([
          "jest.mock('./a');",
          "import x from 'x';",
          "jest.mock('./b');",
          "import y from 'y';"
        ]).join('\n'),
        sanitizeNewLineAtEnd([
          "jest.mock('./a');",
          "jest.mock('./b');",
          "import x from 'x';",
          "import y from 'y';"
        ]).join('\n')
      ]
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
    },
    {
      // A simple success using realistic code
      code: [
        'const mockPlaySoundFile = jest.fn();',
        "jest.mock('./SoundPlayer', () => {",
        "  const React = require('react')",
        '  return {',
        '    SoundPlayer: jest.fn().mockImplementation(() => {',
        '      return { playSoundFile: mockPlaySoundFile };',
        '    })',
        '  };',
        '});',
        "jest.mock('./moduleA')"
      ].join('\n')
    }
  ]
});
