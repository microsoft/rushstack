// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as nodeJsPath from 'path';
import { Import } from '../Import';
import { PackageJsonLookup } from '../PackageJsonLookup';

describe('Import', () => {
  const pacakgeRoot: string = PackageJsonLookup.instance.tryGetPackageFolderFor(__dirname)!;

  describe('resolveModule', () => {
    it('returns an absolute path as-is', () => {
      const absolutePaths: string[] = ['/var/test/path'];

      for (const absolutePath of absolutePaths) {
        expect(Import.resolveModule({ modulePath: absolutePath, baseFolderPath: __dirname })).toEqual(
          absolutePath
        );
      }
    });

    it('resolves a relative path', () => {
      expect(Import.resolveModule({ modulePath: './baz', baseFolderPath: __dirname })).toEqual(
        nodeJsPath.join(__dirname, 'baz')
      );
      expect(Import.resolveModule({ modulePath: '../baz', baseFolderPath: __dirname })).toEqual(
        nodeJsPath.resolve(__dirname, '..', 'baz')
      );
      expect(Import.resolveModule({ modulePath: './baz/ban', baseFolderPath: __dirname })).toEqual(
        nodeJsPath.join(__dirname, 'baz', 'ban')
      );
      expect(Import.resolveModule({ modulePath: '../baz/ban', baseFolderPath: __dirname })).toEqual(
        nodeJsPath.resolve(__dirname, '..', 'baz', 'ban')
      );
    });

    it('resolves a dependency', () => {
      expect(
        Import.resolveModule({ modulePath: '@rushstack/heft', baseFolderPath: __dirname }).replace(/\\/g, '/')
      ).toMatch(/node_modules\/@rushstack\/heft\/lib\/index.js$/);
    });

    it('resolves a path inside a dependency', () => {
      expect(
        Import.resolveModule({
          modulePath: '@rushstack/heft/lib/start.js',
          baseFolderPath: __dirname
        }).replace(/\\/g, '/')
      ).toMatch(/node_modules\/@rushstack\/heft\/lib\/start\.js$/);
    });

    it('resolves a dependency of a dependency', () => {
      expect(
        Import.resolveModule({
          modulePath: '@rushstack/ts-command-line',
          baseFolderPath: nodeJsPath.join(pacakgeRoot, 'node_modules', '@rushstack', 'heft')
        }).replace(/\\/g, '/')
      ).toMatch(/node_modules\/@rushstack\/ts-command-line\/lib\/index\.js$/);
    });

    it('resolves a path inside a dependency of a dependency', () => {
      expect(
        Import.resolveModule({
          modulePath: '@rushstack/ts-command-line/lib/Constants.js',
          baseFolderPath: nodeJsPath.join(pacakgeRoot, 'node_modules', '@rushstack', 'heft')
        }).replace(/\\/g, '/')
      ).toMatch(/node_modules\/@rushstack\/ts-command-line\/lib\/Constants\.js$/);
    });

    describe('allowSelfReference', () => {
      it('resolves a path inside this package with allowSelfReference turned on', () => {
        expect(
          Import.resolveModule({
            modulePath: '@rushstack/node-core-library',
            baseFolderPath: __dirname,
            allowSelfReference: true
          })
        ).toEqual(pacakgeRoot);
        expect(
          Import.resolveModule({
            modulePath: '@rushstack/node-core-library/lib/Constants.js',
            baseFolderPath: __dirname,
            allowSelfReference: true
          })
        ).toEqual(nodeJsPath.join(pacakgeRoot, 'lib', 'Constants.js'));
      });

      it('throws on an attempt to reference this package without allowSelfReference turned on', () => {
        expect(() =>
          Import.resolveModule({
            modulePath: '@rushstack/node-core-library',
            baseFolderPath: __dirname
          })
        ).toThrowError(/^Cannot find module "@rushstack\/node-core-library" from ".+"\.$/);
        expect(() =>
          Import.resolveModule({
            modulePath: '@rushstack/node-core-library/lib/Constants.js',
            baseFolderPath: __dirname
          })
        ).toThrowError(/^Cannot find module "@rushstack\/node-core-library\/lib\/Constants.js" from ".+"\.$/);
      });
    });

    describe('includeSystemModules', () => {
      it('resolves a system module with includeSystemModules turned on', () => {
        expect(
          Import.resolveModule({ modulePath: 'http', baseFolderPath: __dirname, includeSystemModules: true })
        ).toEqual('http');
      });

      it('throws on an attempt to resolve a system module without includeSystemModules turned on', () => {
        expect(() => Import.resolveModule({ modulePath: 'http', baseFolderPath: __dirname })).toThrowError(
          /^Cannot find module "http" from ".+"\.$/
        );
      });

      it('throws on an attempt to resolve a path inside a system module with includeSystemModules turned on', () => {
        expect(() =>
          Import.resolveModule({
            modulePath: 'http/foo/bar',
            baseFolderPath: __dirname,
            includeSystemModules: true
          })
        ).toThrowError(/^Cannot find module "http\/foo\/bar" from ".+"\.$/);
      });
    });
  });

  describe('resolvePackage', () => {
    it('resolves a dependency', () => {
      expect(
        Import.resolvePackage({ packageName: '@rushstack/heft', baseFolderPath: __dirname }).replace(
          /\\/g,
          '/'
        )
      ).toMatch(/node_modules\/@rushstack\/heft$/);
    });

    it('fails to resolve a path inside a dependency', () => {
      expect(() =>
        Import.resolvePackage({
          packageName: '@rushstack/heft/lib/start.js',
          baseFolderPath: __dirname
        }).replace(/\\/g, '/')
      ).toThrowError(/^Cannot find package "@rushstack\/heft\/lib\/start.js" from ".+"\.$/);
    });

    it('resolves a dependency of a dependency', () => {
      expect(
        Import.resolvePackage({
          packageName: '@rushstack/ts-command-line',
          baseFolderPath: nodeJsPath.join(pacakgeRoot, 'node_modules', '@rushstack', 'heft')
        }).replace(/\\/g, '/')
      ).toMatch(/node_modules\/@rushstack\/ts-command-line$/);
    });

    it('fails to resolve a path inside a dependency of a dependency', () => {
      expect(() =>
        Import.resolvePackage({
          packageName: '@rushstack/ts-command-line/lib/Constants.js',
          baseFolderPath: nodeJsPath.join(pacakgeRoot, 'node_modules', '@rushstack', 'heft')
        }).replace(/\\/g, '/')
      ).toThrowError(/^Cannot find package "@rushstack\/ts-command-line\/lib\/Constants.js" from ".+"\.$/);
    });

    describe('allowSelfReference', () => {
      it('resolves this package with allowSelfReference turned on', () => {
        expect(
          Import.resolvePackage({
            packageName: '@rushstack/node-core-library',
            baseFolderPath: __dirname,
            allowSelfReference: true
          })
        ).toEqual(pacakgeRoot);
      });

      it('fails to resolve a path inside this package with allowSelfReference turned on', () => {
        expect(() =>
          Import.resolvePackage({
            packageName: '@rushstack/node-core-library/lib/Constants.js',
            baseFolderPath: __dirname,
            allowSelfReference: true
          })
        ).toThrowError(
          /^Cannot find package "@rushstack\/node-core-library\/lib\/Constants.js" from ".+"\.$/
        );
      });

      it('throws on an attempt to reference this package without allowSelfReference turned on', () => {
        expect(() =>
          Import.resolvePackage({
            packageName: '@rushstack/node-core-library',
            baseFolderPath: __dirname
          })
        ).toThrowError(/^Cannot find package "@rushstack\/node-core-library" from ".+"\.$/);
      });
    });

    describe('includeSystemModules', () => {
      it('resolves a system module with includeSystemModules turned on', () => {
        expect(
          Import.resolvePackage({
            packageName: 'http',
            baseFolderPath: __dirname,
            includeSystemModules: true
          })
        ).toEqual('http');
      });

      it('throws on an attempt to resolve a system module without includeSystemModules turned on', () => {
        expect(() => Import.resolvePackage({ packageName: 'http', baseFolderPath: __dirname })).toThrowError(
          /^Cannot find package "http" from ".+"\.$/
        );
      });

      it('throws on an attempt to resolve a path inside a system module with includeSystemModules turned on', () => {
        expect(() =>
          Import.resolvePackage({
            packageName: 'http/foo/bar',
            baseFolderPath: __dirname,
            includeSystemModules: true
          })
        ).toThrowError(/^Cannot find package "http\/foo\/bar" from ".+"\.$/);
      });
    });
  });
});
