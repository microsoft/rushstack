import { DependencySpecifier, DependencySpecifierType } from '../../DependencySpecifier';
import { PnpmShrinkwrapFile, parsePnpmDependencyKey } from '../PnpmShrinkwrapFile';

const DEPENDENCY_NAME: string = 'dependency_name';
const SCOPED_DEPENDENCY_NAME: string = '@scope/dependency_name';
const VERSION: string = '1.4.0';
const PRERELEASE_VERSION: string = '1.4.0-prerelease.0';

describe(PnpmShrinkwrapFile.name, () => {
  describe(parsePnpmDependencyKey.name, () => {
    it('Does not support file:// specifiers', () => {
      const parsedSpecifier: DependencySpecifier | undefined = parsePnpmDependencyKey(
        DEPENDENCY_NAME,
        'file:///path/to/file'
      );
      expect(parsedSpecifier).toBeUndefined();
    });

    it('Supports a variety of non-aliased package specifiers', () => {
      function testSpecifiers(specifiers: string[], expectedName: string, expectedVersion: string): void {
        for (const specifier of specifiers) {
          const parsedSpecifier: DependencySpecifier | undefined = parsePnpmDependencyKey(
            expectedName,
            specifier
          );
          expect(parsedSpecifier).toBeDefined();
          expect(parsedSpecifier!.specifierType).toBe(DependencySpecifierType.Version);
          expect(parsedSpecifier!.packageName).toBe(expectedName);
          expect(parsedSpecifier!.versionSpecifier).toBe(expectedVersion);
        }
      }

      // non-scoped, non-prerelease
      testSpecifiers(
        [
          `path.pkgs.visualstudio.com/${DEPENDENCY_NAME}/${VERSION}`,
          `/${DEPENDENCY_NAME}/${VERSION}`,
          `/${DEPENDENCY_NAME}/${VERSION}/peer1@3.5.0+peer2@1.17.7`
        ],
        DEPENDENCY_NAME,
        VERSION
      );

      // scoped, non-prerelease
      testSpecifiers(
        [
          `path.pkgs.visualstudio.com/${SCOPED_DEPENDENCY_NAME}/${VERSION}`,
          `/${SCOPED_DEPENDENCY_NAME}/${VERSION}`,
          `/${SCOPED_DEPENDENCY_NAME}/${VERSION}/peer1@3.5.0+peer2@1.17.7`
        ],
        SCOPED_DEPENDENCY_NAME,
        VERSION
      );

      // non-scoped, prerelease
      testSpecifiers(
        [
          `path.pkgs.visualstudio.com/${DEPENDENCY_NAME}/${PRERELEASE_VERSION}`,
          `/${DEPENDENCY_NAME}/${PRERELEASE_VERSION}`,
          `/${DEPENDENCY_NAME}/${PRERELEASE_VERSION}/peer1@3.5.0+peer2@1.17.7`
        ],
        DEPENDENCY_NAME,
        PRERELEASE_VERSION
      );

      // scoped, prerelease
      testSpecifiers(
        [
          `path.pkgs.visualstudio.com/${SCOPED_DEPENDENCY_NAME}/${PRERELEASE_VERSION}`,
          `/${SCOPED_DEPENDENCY_NAME}/${PRERELEASE_VERSION}`,
          `/${SCOPED_DEPENDENCY_NAME}/${PRERELEASE_VERSION}/peer1@3.5.0+peer2@1.17.7`
        ],
        SCOPED_DEPENDENCY_NAME,
        PRERELEASE_VERSION
      );
    });

    it('Supports aliased package specifiers', () => {
      const parsedSpecifier: DependencySpecifier | undefined = parsePnpmDependencyKey(
        SCOPED_DEPENDENCY_NAME,
        `/${DEPENDENCY_NAME}/${VERSION}`
      );
      expect(parsedSpecifier).toBeDefined();
      expect(parsedSpecifier!.specifierType).toBe(DependencySpecifierType.Alias);
      expect(parsedSpecifier!.packageName).toBe(SCOPED_DEPENDENCY_NAME);
      expect(parsedSpecifier!.versionSpecifier).toMatchInlineSnapshot(`"npm:dependency_name@1.4.0"`);
    });

    it('Supports URL package specifiers', () => {
      const specifiers: string[] = [
        '@github.com/abc/def/188ed64efd5218beda276e02f2277bf3a6b745b2',
        'github.com/abc/def/188ed64efd5218beda276e02f2277bf3a6b745b2',
        'github.com.au/abc/def/188ed64efd5218beda276e02f2277bf3a6b745b2',
        'bitbucket.com/abc/def/188ed64efd5218beda276e02f2277bf3a6b745b2',
        'bitbucket.com+abc/def/188ed64efd5218beda276e02f2277bf3a6b745b2',
        'git@bitbucket.com+abc/def/188ed64efd5218beda276e02f2277bf3a6b745b2',
        'bitbucket.co.in/abc/def/188ed64efd5218beda276e02f2277bf3a6b745b2'
      ];

      for (const specifier of specifiers) {
        const parsedSpecifier: DependencySpecifier | undefined = parsePnpmDependencyKey(
          SCOPED_DEPENDENCY_NAME,
          specifier
        );
        expect(parsedSpecifier).toBeDefined();
        expect(parsedSpecifier!.specifierType).toBe(DependencySpecifierType.Directory);
        expect(parsedSpecifier!.packageName).toBe(SCOPED_DEPENDENCY_NAME);
        expect(parsedSpecifier!.versionSpecifier).toBe(specifier);
      }
    });
  });
});
