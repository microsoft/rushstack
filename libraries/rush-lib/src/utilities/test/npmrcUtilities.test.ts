// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { trimNpmrcFileLines } from '../npmrcUtilities';

describe('npmrcUtilities', () => {
  function runTests(supportEnvVarFallbackSyntax: boolean): void {
    it('handles empty input', () => {
      expect(trimNpmrcFileLines([], {}, supportEnvVarFallbackSyntax)).toEqual([]);
    });

    it('supports a variable without a fallback', () => {
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

    describe('With npm-incompatible properties filtering', () => {
      const supportEnvVarFallbackSyntax = false;
      const filterNpmIncompatibleProperties = true;

      it('filters out pnpm-specific hoisting properties', () => {
        expect(
          trimNpmrcFileLines(
            [
              'registry=https://registry.npmjs.org/',
              'hoist=false',
              'hoist-pattern[]=*eslint*',
              'public-hoist-pattern[]=',
              'shamefully-hoist=true',
              'always-auth=false'
            ],
            {},
            supportEnvVarFallbackSyntax,
            filterNpmIncompatibleProperties
          )
        ).toMatchSnapshot();
      });

      it('filters out deprecated npm properties', () => {
        expect(
          trimNpmrcFileLines(
            ['registry=https://registry.npmjs.org/', 'email=test@example.com', 'publish-branch=main'],
            {},
            supportEnvVarFallbackSyntax,
            filterNpmIncompatibleProperties
          )
        ).toMatchSnapshot();
      });

      it('preserves registry-scoped auth tokens', () => {
        expect(
          trimNpmrcFileLines(
            [
              'registry=https://registry.npmjs.org/',
              '//registry.npmjs.org/:_authToken=${NPM_TOKEN}',
              '//my-registry.com/:_authToken=${MY_TOKEN}',
              'email=test@example.com'
            ],
            { NPM_TOKEN: 'abc123', MY_TOKEN: 'xyz789' },
            supportEnvVarFallbackSyntax,
            filterNpmIncompatibleProperties
          )
        ).toMatchSnapshot();
      });

      it('preserves registry-scoped configurations', () => {
        expect(
          trimNpmrcFileLines(
            [
              'registry=https://registry.npmjs.org/',
              '//registry.npmjs.org/:always-auth=true',
              '//my-registry.com/:_authToken=${MY_TOKEN}',
              'hoist=false'
            ],
            { MY_TOKEN: 'xyz789' },
            supportEnvVarFallbackSyntax,
            filterNpmIncompatibleProperties
          )
        ).toMatchSnapshot();
      });

      it('does not filter when filterNpmIncompatibleProperties is false', () => {
        expect(
          trimNpmrcFileLines(
            ['registry=https://registry.npmjs.org/', 'email=test@example.com', 'hoist=false'],
            {},
            supportEnvVarFallbackSyntax,
            false
          )
        ).toMatchSnapshot();
      });

      it('preserves standard npm properties', () => {
        expect(
          trimNpmrcFileLines(
            [
              'registry=https://registry.npmjs.org/',
              'always-auth=false',
              'strict-ssl=true',
              'save-exact=true',
              'package-lock=true',
              'hoist=false',
              'email=test@example.com'
            ],
            {},
            supportEnvVarFallbackSyntax,
            filterNpmIncompatibleProperties
          )
        ).toMatchSnapshot();
      });
    });
  });
});
