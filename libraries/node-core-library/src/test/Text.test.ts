// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Text } from '../Text';

describe('Text', () => {
  describe(Text.padEnd.name, () => {
    it("Throws an exception if the padding character isn't a single character", () => {
      expect(() => Text.padEnd('123', 1, '')).toThrow();
      expect(() => Text.padEnd('123', 1, '  ')).toThrow();
    });

    it("Doesn't change the string if it's already at or greater than the minimum length", () => {
      expect(Text.padEnd('12345', 5)).toEqual('12345');
      expect(Text.padEnd('123456', 5)).toEqual('123456');
      expect(Text.padEnd('12345', 5, '0')).toEqual('12345');
      expect(Text.padEnd('123456', 5, '0')).toEqual('123456');
    });

    it('Appends the default character (spaces) to the end of a string', () => {
      expect(Text.padEnd('', 5)).toEqual('     ');
      expect(Text.padEnd('123', 5)).toEqual('123  ');
    });

    it('Appends the characters to the end of a string', () => {
      expect(Text.padEnd('', 5, '0')).toEqual('00000');
      expect(Text.padEnd('123', 5, '0')).toEqual('12300');
    });
  });

  describe(Text.padStart.name, () => {
    it("Throws an exception if the padding character isn't a single character", () => {
      expect(() => Text.padStart('123', 1, '')).toThrow();
      expect(() => Text.padStart('123', 1, '  ')).toThrow();
    });

    it("Doesn't change the string if it's already at or greater than the minimum length", () => {
      expect(Text.padStart('12345', 5)).toEqual('12345');
      expect(Text.padStart('123456', 5)).toEqual('123456');
      expect(Text.padStart('12345', 5, '0')).toEqual('12345');
      expect(Text.padStart('123456', 5, '0')).toEqual('123456');
    });

    it('Appends the default character (spaces) to the end of a string', () => {
      expect(Text.padStart('', 5)).toEqual('     ');
      expect(Text.padStart('123', 5)).toEqual('  123');
    });

    it('Appends the characters to the end of a string', () => {
      expect(Text.padStart('', 5, '0')).toEqual('00000');
      expect(Text.padStart('123', 5, '0')).toEqual('00123');
    });
  });

  describe(Text.truncateWithEllipsis.name, () => {
    it('Throws an exception if the maximum length is less than zero', () => {
      expect(() => Text.truncateWithEllipsis('123', -1)).toThrow();
    });

    it("Doesn't change the string if it's already shorter than the maximum length", () => {
      expect(Text.truncateWithEllipsis('', 2)).toEqual('');
      expect(Text.truncateWithEllipsis('1', 2)).toEqual('1');
      expect(Text.truncateWithEllipsis('12', 2)).toEqual('12');

      expect(Text.truncateWithEllipsis('123', 5)).toEqual('123');
      expect(Text.truncateWithEllipsis('1234', 5)).toEqual('1234');
    });

    it('Truncates strings', () => {
      expect(Text.truncateWithEllipsis('123', 0)).toEqual('');
      expect(Text.truncateWithEllipsis('123', 2)).toEqual('12');
      expect(Text.truncateWithEllipsis('12345', 5)).toEqual('12345');
      expect(Text.truncateWithEllipsis('123456', 5)).toEqual('12...');
    });
  });

  describe(Text.convertToLf.name, () => {
    it('degenerate adjacent newlines', () => {
      expect(Text.convertToLf('')).toEqual('');
      expect(Text.convertToLf('\n')).toEqual('\n');
      expect(Text.convertToLf('\r')).toEqual('\n');
      expect(Text.convertToLf('\n\n')).toEqual('\n\n');
      expect(Text.convertToLf('\r\n')).toEqual('\n');
      expect(Text.convertToLf('\n\r')).toEqual('\n');
      expect(Text.convertToLf('\r\r')).toEqual('\n\n');
      expect(Text.convertToLf('\n\n\n')).toEqual('\n\n\n');
      expect(Text.convertToLf('\r\n\n')).toEqual('\n\n');
      expect(Text.convertToLf('\n\r\n')).toEqual('\n\n');
      expect(Text.convertToLf('\r\r\n')).toEqual('\n\n');
      expect(Text.convertToLf('\n\n\r')).toEqual('\n\n');
      expect(Text.convertToLf('\r\n\r')).toEqual('\n\n');
      expect(Text.convertToLf('\n\r\r')).toEqual('\n\n');
      expect(Text.convertToLf('\r\r\r')).toEqual('\n\n\n');
    });
    it('degenerate mixed newlines', () => {
      expect(Text.convertToLf('\nX\n\r')).toEqual('\nX\n');
      expect(Text.convertToLf('\rX\r')).toEqual('\nX\n');
      expect(Text.convertToLf('\r \n')).toEqual('\n \n');
    });
  });

  describe(Text.escapeRegExp.name, () => {
    it('escapes special characters', () => {
      expect(Text.escapeRegExp('')).toEqual('');
      expect(Text.escapeRegExp('abc')).toEqual('abc');
      expect(Text.escapeRegExp('a.c')).toEqual('a\\.c');
      expect(Text.escapeRegExp('a*c')).toEqual('a\\*c');
      expect(Text.escapeRegExp('a?c')).toEqual('a\\?c');
      expect(Text.escapeRegExp('a+c')).toEqual('a\\+c');
      expect(Text.escapeRegExp('a{c')).toEqual('a\\{c');
      expect(Text.escapeRegExp('a}c')).toEqual('a\\}c');
      expect(Text.escapeRegExp('a(c')).toEqual('a\\(c');
      expect(Text.escapeRegExp('a)c')).toEqual('a\\)c');
      expect(Text.escapeRegExp('a[c')).toEqual('a\\[c');
      expect(Text.escapeRegExp('a]c')).toEqual('a\\]c');
      expect(Text.escapeRegExp('a|c')).toEqual('a\\|c');
      expect(Text.escapeRegExp('a^c')).toEqual('a\\^c');
      expect(Text.escapeRegExp('a$c')).toEqual('a\\$c');
      expect(Text.escapeRegExp('a\\c')).toEqual('a\\\\c');
    });
  });

  describe(Text.splitByNewLines.name, () => {
    it('splits a string by newlines', () => {
      expect(Text.splitByNewLines(undefined)).toEqual(undefined);
      expect(Text.splitByNewLines('')).toEqual(['']);
      expect(Text.splitByNewLines('abc')).toEqual(['abc']);
      expect(Text.splitByNewLines('a\nb\nc')).toEqual(['a', 'b', 'c']);
      expect(Text.splitByNewLines('a\nb\nc\n')).toEqual(['a', 'b', 'c', '']);
      expect(Text.splitByNewLines('a\nb\nc\n\n')).toEqual(['a', 'b', 'c', '', '']);
      expect(Text.splitByNewLines('\n\na\nb\nc\n\n')).toEqual(['', '', 'a', 'b', 'c', '', '']);
      expect(Text.splitByNewLines('a\r\nb\nc')).toEqual(['a', 'b', 'c']);
    });
  });
});
