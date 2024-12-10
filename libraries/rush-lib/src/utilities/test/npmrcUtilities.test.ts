// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { trimNpmrcFileLines } from '../npmrcUtilities';

describe('npmrcUtilities', () => {
  function runTests(supportEnvVarFallbackSyntax: boolean): void {
    it('handles empty input', () => {
      expect(trimNpmrcFileLines([], {}, supportEnvVarFallbackSyntax)).toEqual([]);
    });

    it('supports a a variable without a fallback', () => {
      expect(trimNpmrcFileLines(['var1=${foo}'], {}, supportEnvVarFallbackSyntax)).toMatchSnapshot();
      expect(
        trimNpmrcFileLines(['var1=${foo}'], { foo: 'test' }, supportEnvVarFallbackSyntax)
      ).toMatchSnapshot();
    });

    it('supports a variable with a fallback', () => {
      expect(
        trimNpmrcFileLines(['var1=${foo-fallback_value}'], {}, supportEnvVarFallbackSyntax)
      ).toMatchSnapshot();
      expect(
        trimNpmrcFileLines(['var1=${foo-fallback_value}'], { foo: 'test' }, supportEnvVarFallbackSyntax)
      ).toMatchSnapshot();
      expect(
        trimNpmrcFileLines(['var1=${foo:-fallback_value}'], {}, supportEnvVarFallbackSyntax)
      ).toMatchSnapshot();
      expect(
        trimNpmrcFileLines(['var1=${foo:-fallback_value}'], { foo: 'test' }, supportEnvVarFallbackSyntax)
      ).toMatchSnapshot();
      expect(
        trimNpmrcFileLines(['var1=${foo}-${bar}'], { foo: 'test' }, supportEnvVarFallbackSyntax)
      ).toMatchSnapshot();
      expect(
        trimNpmrcFileLines(['var1=${foo}-${bar}'], { bar: 'test' }, supportEnvVarFallbackSyntax)
      ).toMatchSnapshot();
      expect(
        trimNpmrcFileLines(['var1=${foo}-${bar}'], { foo: 'test', bar: 'test' }, supportEnvVarFallbackSyntax)
      ).toMatchSnapshot();
      expect(
        trimNpmrcFileLines(
          ['var1=${foo:-fallback_value}-${bar-fallback_value}'],
          {},
          supportEnvVarFallbackSyntax
        )
      ).toMatchSnapshot();
    });

    it('supports multiple lines', () => {
      expect(
        trimNpmrcFileLines(['var1=${foo}', 'var2=${bar}'], { foo: 'test' }, supportEnvVarFallbackSyntax)
      ).toMatchSnapshot();
      expect(
        trimNpmrcFileLines(
          ['var1=${foo}', 'var2=${bar}'],
          { foo: 'test', bar: 'test' },
          supportEnvVarFallbackSyntax
        )
      ).toMatchSnapshot();
      expect(
        trimNpmrcFileLines(
          ['var1=${foo}', 'var2=${bar-fallback_value}'],
          { foo: 'test' },
          supportEnvVarFallbackSyntax
        )
      ).toMatchSnapshot();
      expect(
        trimNpmrcFileLines(
          ['var1=${foo:-fallback_value}', 'var2=${bar-fallback_value}'],
          {},
          supportEnvVarFallbackSyntax
        )
      ).toMatchSnapshot();
    });

    it('supports malformed lines', () => {
      // Malformed
      expect(
        trimNpmrcFileLines(['var1=${foo_fallback_value}'], {}, supportEnvVarFallbackSyntax)
      ).toMatchSnapshot();
      expect(
        trimNpmrcFileLines(['var1=${foo:fallback_value}'], {}, supportEnvVarFallbackSyntax)
      ).toMatchSnapshot();
      expect(
        trimNpmrcFileLines(['var1=${foo:_fallback_value}'], {}, supportEnvVarFallbackSyntax)
      ).toMatchSnapshot();
      expect(trimNpmrcFileLines(['var1=${foo'], {}, supportEnvVarFallbackSyntax)).toMatchSnapshot();
    });
  }

  describe(trimNpmrcFileLines.name, () => {
    describe('With support for env var fallback syntax', () => runTests(true));
    describe('Without support for env var fallback syntax', () => runTests(false));
  });
});
