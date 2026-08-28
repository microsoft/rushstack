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

      it('filters out pnpm-specific registry-scoped properties', () => {
        expect(
          trimNpmrcFileLines(
            [
              'registry=https://registry.npmjs.org/',
              '//registry.npmjs.org/:_authToken=${NPM_TOKEN}',
              '//my-registry.com/:tokenHelper=/path/to/helper',
              '//other-registry.com/:urlTokenHelper=/path/to/url-helper',
              '//registry.npmjs.org/:always-auth=true'
            ],
            { NPM_TOKEN: 'abc123' },
            supportEnvVarFallbackSyntax,
            filterNpmIncompatibleProperties
          )
        ).toMatchSnapshot();
      });
    });

    describe('With moveSensitiveSettingsToEnvironment', () => {
      const supportEnvVarFallbackSyntax: boolean = true;
      const filterNpmIncompatibleProperties: boolean = false;
      const moveSensitiveSettingsToEnvironment: boolean = true;

      function trimLines(npmrcFileLines: string[], env: NodeJS.ProcessEnv): string[] {
        return trimNpmrcFileLines(
          npmrcFileLines,
          env,
          supportEnvVarFallbackSyntax,
          filterNpmIncompatibleProperties,
          moveSensitiveSettingsToEnvironment
        );
      }

      it('moves credentials out of the file', () => {
        expect(
          trimLines(
            [
              'registry=https://registry.example.com/npm/registry/',
              '//registry.example.com/npm/registry/:_authToken=${NPM_AUTH_TOKEN}',
              '_authToken=${NPM_AUTH_TOKEN}',
              '//registry.example.com/npm/:_password=${NPM_PASSWORD}',
              '//registry.example.com/npm/:username=${NPM_USERNAME}'
            ],
            { NPM_AUTH_TOKEN: 'token123', NPM_PASSWORD: 'password123', NPM_USERNAME: 'user123' }
          )
        ).toEqual([
          'registry=https://registry.example.com/npm/registry/',
          '; PROVIDED VIA ENVIRONMENT: //registry.example.com/npm/registry/:_authToken=${NPM_AUTH_TOKEN}',
          '; PROVIDED VIA ENVIRONMENT: _authToken=${NPM_AUTH_TOKEN}',
          '; PROVIDED VIA ENVIRONMENT: //registry.example.com/npm/:_password=${NPM_PASSWORD}',
          '; PROVIDED VIA ENVIRONMENT: //registry.example.com/npm/:username=${NPM_USERNAME}'
        ]);
      });

      it('leaves credentials with undefined variables commented out', () => {
        expect(trimLines(['//registry.example.com/npm/:_authToken=${NPM_AUTH_TOKEN}'], {})).toEqual([
          '; MISSING ENVIRONMENT VARIABLE: //registry.example.com/npm/:_authToken=${NPM_AUTH_TOKEN}'
        ]);
      });

      it('honors fallback values', () => {
        expect(
          trimLines(['//registry.example.com/npm/:_authToken=${NPM_AUTH_TOKEN:-fallbackToken}'], {})
        ).toEqual([
          '; PROVIDED VIA ENVIRONMENT: //registry.example.com/npm/:_authToken=${NPM_AUTH_TOKEN:-fallbackToken}'
        ]);
      });

      it('expands settings whose names cannot round-trip through an environment variable', () => {
        // PNPM splits an "npm_config_*" variable name on its FIRST colon, so a registry URL that
        // includes an explicit port cannot be expressed as an environment variable
        expect(
          trimLines(['//registry.example.com:8080/:_authToken=${NPM_AUTH_TOKEN}'], {
            NPM_AUTH_TOKEN: 'token123'
          })
        ).toEqual(['//registry.example.com:8080/:_authToken=token123']);
      });

      it('expands request destinations in the file', () => {
        expect(
          trimLines(
            [
              'registry=https://${REGISTRY_HOST}/npm/registry/',
              '@scope:registry=https://${REGISTRY_HOST}/npm/registry/',
              'https-proxy=https://${PROXY_HOST}/',
              '//${REGISTRY_HOST}/npm/:always-auth=true'
            ],
            { REGISTRY_HOST: 'registry.example.com', PROXY_HOST: 'proxy.example.com' }
          )
        ).toEqual([
          'registry=https://registry.example.com/npm/registry/',
          '@scope:registry=https://registry.example.com/npm/registry/',
          'https-proxy=https://proxy.example.com/',
          '//registry.example.com/npm/:always-auth=true'
        ]);
      });

      it('does not modify settings that PNPM expands itself', () => {
        expect(
          trimLines(
            [
              '; //registry.example.com/npm/:_authToken=${NPM_AUTH_TOKEN}',
              'registry=https://registry.example.com/npm/registry/',
              'store-dir=${STORE_DIR}',
              'always-auth=true'
            ],
            { STORE_DIR: '/tmp/store' }
          )
        ).toEqual([
          '; //registry.example.com/npm/:_authToken=${NPM_AUTH_TOKEN}',
          'registry=https://registry.example.com/npm/registry/',
          'store-dir=${STORE_DIR}',
          'always-auth=true'
        ]);
      });

      it('does not modify anything when the option is disabled', () => {
        expect(
          trimNpmrcFileLines(
            [
              'registry=https://${REGISTRY_HOST}/npm/registry/',
              '//registry.example.com/npm/:_authToken=${NPM_AUTH_TOKEN}'
            ],
            { REGISTRY_HOST: 'registry.example.com', NPM_AUTH_TOKEN: 'token123' },
            supportEnvVarFallbackSyntax,
            filterNpmIncompatibleProperties,
            false
          )
        ).toEqual([
          'registry=https://${REGISTRY_HOST}/npm/registry/',
          '//registry.example.com/npm/:_authToken=${NPM_AUTH_TOKEN}'
        ]);
      });
    });
  });
});
