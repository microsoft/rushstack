// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import { JsonFile } from '@rushstack/node-core-library';

import type { BaseShrinkwrapFile } from '../base/BaseShrinkwrapFile';
import { ShrinkwrapFileFactory } from '../ShrinkwrapFileFactory';
import {
  parsePnpmDependencyKey,
  PnpmShrinkwrapFile,
  ShrinkwrapFileMajorVersion
} from '../pnpm/PnpmShrinkwrapFile';
import { DependencySpecifier } from '../DependencySpecifier';
import { NpmShrinkwrapFile } from '../npm/NpmShrinkwrapFile';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';

describe(NpmShrinkwrapFile.name, () => {
  const shrinkwrapFilePath: string = `${__dirname}/shrinkwrapFile/npm-shrinkwrap.json`;
  const shrinkwrapFile: BaseShrinkwrapFile = ShrinkwrapFileFactory.getShrinkwrapFile({
    packageManager: 'npm',
    shrinkwrapFilePath,
    subspaceHasNoProjects: false
  })!;

  it('verifies root-level dependency', () => {
    expect(shrinkwrapFile.hasCompatibleTopLevelDependency(new DependencySpecifier('q', '~1.5.0'))).toEqual(
      true
    );
  });

  it('verifies temp project dependencies', () => {
    // Found locally
    expect(
      shrinkwrapFile.tryEnsureCompatibleDependency(
        new DependencySpecifier('jquery', '>=2.2.4 <3.0.0'),
        '@rush-temp/project2'
      )
    ).toEqual(true);
    // Found at root
    expect(
      shrinkwrapFile.tryEnsureCompatibleDependency(
        new DependencySpecifier('q', '~1.5.0'),
        '@rush-temp/project2'
      )
    ).toEqual(true);
  });

  it('extracts temp projects successfully', () => {
    const tempProjectNames: ReadonlyArray<string> = shrinkwrapFile.getTempProjectNames();

    expect(tempProjectNames).toEqual(['@rush-temp/project1', '@rush-temp/project2']);
  });
});

describe(PnpmShrinkwrapFile.name, () => {
  describe('non-workspace', () => {
    function validateNonWorkspaceLockfile(shrinkwrapFile: BaseShrinkwrapFile): void {
      it('verifies root-level dependency', () => {
        expect(
          shrinkwrapFile.hasCompatibleTopLevelDependency(new DependencySpecifier('q', '~1.5.0'))
        ).toEqual(false);
      });

      it('verifies temp project dependencies', () => {
        expect(
          shrinkwrapFile.tryEnsureCompatibleDependency(
            new DependencySpecifier('jquery', '>=1.0.0 <2.0.0'),
            '@rush-temp/project1'
          )
        ).toEqual(true);
        expect(
          shrinkwrapFile.tryEnsureCompatibleDependency(
            new DependencySpecifier('q', '~1.5.0'),
            '@rush-temp/project2'
          )
        ).toEqual(true);
        expect(
          shrinkwrapFile.tryEnsureCompatibleDependency(
            new DependencySpecifier('pad-left', '^2.0.0'),
            '@rush-temp/project1'
          )
        ).toEqual(false);

        if (
          shrinkwrapFile instanceof PnpmShrinkwrapFile &&
          shrinkwrapFile.shrinkwrapFileMajorVersion >= ShrinkwrapFileMajorVersion.V9
        ) {
          expect(
            shrinkwrapFile.tryEnsureCompatibleDependency(
              new DependencySpecifier(
                '@scope/testDep',
                'https://github.com/jonschlinkert/pad-left/tarball/2.1.0'
              ),
              '@rush-temp/project3'
            )
          ).toEqual(true);
        } else {
          expect(
            shrinkwrapFile.tryEnsureCompatibleDependency(
              new DependencySpecifier('@scope/testDep', '>=2.0.0 <3.0.0'),
              '@rush-temp/project3'
            )
          ).toEqual(true);
        }
      });

      it('extracts temp projects successfully', () => {
        const tempProjectNames: ReadonlyArray<string> = shrinkwrapFile.getTempProjectNames();

        expect(tempProjectNames).toEqual([
          '@rush-temp/project1',
          '@rush-temp/project2',
          '@rush-temp/project3'
        ]);
      });
    }

    describe('V5.0 lockfile', () => {
      const shrinkwrapFilePath: string = path.resolve(
        __dirname,
        '../../../src/logic/test/shrinkwrapFile/non-workspace-pnpm-lock-v5.yaml'
      );
      const shrinkwrapFile: BaseShrinkwrapFile = ShrinkwrapFileFactory.getShrinkwrapFile({
        packageManager: 'pnpm',
        shrinkwrapFilePath,
        subspaceHasNoProjects: false
      })!;

      validateNonWorkspaceLockfile(shrinkwrapFile);
      expect(shrinkwrapFile.isWorkspaceCompatible).toBe(false);
    });

    describe('V5.3 lockfile', () => {
      const shrinkwrapFilePath: string = path.resolve(
        __dirname,
        '../../../src/logic/test/shrinkwrapFile/non-workspace-pnpm-lock-v5.3.yaml'
      );
      const shrinkwrapFile: BaseShrinkwrapFile = ShrinkwrapFileFactory.getShrinkwrapFile({
        packageManager: 'pnpm',
        shrinkwrapFilePath,
        subspaceHasNoProjects: false
      })!;

      validateNonWorkspaceLockfile(shrinkwrapFile);
      expect(shrinkwrapFile.isWorkspaceCompatible).toBe(false);
    });

    describe('V6.1 lockfile', () => {
      const shrinkwrapFilePath: string = path.resolve(
        __dirname,
        '../../../src/logic/test/shrinkwrapFile/non-workspace-pnpm-lock-v6.1.yaml'
      );
      const shrinkwrapFile: BaseShrinkwrapFile = ShrinkwrapFileFactory.getShrinkwrapFile({
        packageManager: 'pnpm',
        shrinkwrapFilePath,
        subspaceHasNoProjects: false
      })!;

      validateNonWorkspaceLockfile(shrinkwrapFile);
      expect(shrinkwrapFile.isWorkspaceCompatible).toBe(false);
    });

    describe('V9 lockfile', () => {
      const shrinkwrapFilePath: string = path.resolve(
        __dirname,
        '../../../src/logic/test/shrinkwrapFile/non-workspace-pnpm-lock-v9.yaml'
      );
      const shrinkwrapFile: BaseShrinkwrapFile = ShrinkwrapFileFactory.getShrinkwrapFile({
        packageManager: 'pnpm',
        shrinkwrapFilePath,
        subspaceHasNoProjects: false
      })!;
      validateNonWorkspaceLockfile(shrinkwrapFile);
      expect(shrinkwrapFile.isWorkspaceCompatible).toBe(false);
    });
  });

  describe('workspace', () => {
    let jsonSaveAsyncSpy: jest.SpyInstance;
    beforeEach(() => {
      jsonSaveAsyncSpy = jest.spyOn(JsonFile, 'saveAsync').mockReturnValue(Promise.resolve(true));
    });

    afterEach(() => {
      jsonSaveAsyncSpy.mockRestore();
    });

    function validateWorkspaceLockfile(shrinkwrapFile: BaseShrinkwrapFile): void {
      it('verifies project dependencies', async () => {
        const projectNames: string[] = ['project1', 'project2', 'project3'];
        for (const projectName of projectNames) {
          jsonSaveAsyncSpy.mockClear();
          const rushConfigurationProject: RushConfigurationProject = {
            projectRushTempFolder: `${projectName}/.rush/temp`,
            projectFolder: projectName,
            rushConfiguration: {
              commonTempFolder: 'common/temp'
            },
            subspace: {
              getSubspaceTempFolderPath: () => 'common/temp'
            }
          } as RushConfigurationProject;

          const projectShrinkwrap = shrinkwrapFile.getProjectShrinkwrap(rushConfigurationProject);
          await projectShrinkwrap?.updateProjectShrinkwrapAsync();
          expect(jsonSaveAsyncSpy).toHaveBeenCalledTimes(1);
          expect(jsonSaveAsyncSpy.mock.calls).toMatchSnapshot(projectName);
        }
      });

      it('does not have any temp projects', () => {
        const tempProjectNames: ReadonlyArray<string> = shrinkwrapFile.getTempProjectNames();
        expect(tempProjectNames).toHaveLength(0);
      });
    }

    describe('V5.3 lockfile', () => {
      const shrinkwrapFilePath: string = path.resolve(
        __dirname,
        '../../../src/logic/test/shrinkwrapFile/workspace-pnpm-lock-v5.3.yaml'
      );
      const shrinkwrapFile: BaseShrinkwrapFile = ShrinkwrapFileFactory.getShrinkwrapFile({
        packageManager: 'pnpm',
        shrinkwrapFilePath,
        subspaceHasNoProjects: false
      })!;

      validateWorkspaceLockfile(shrinkwrapFile);
      expect(shrinkwrapFile.isWorkspaceCompatible).toBe(true);
    });

    describe('V6.1 lockfile', () => {
      const shrinkwrapFilePath: string = path.resolve(
        __dirname,
        '../../../src/logic/test/shrinkwrapFile/workspace-pnpm-lock-v5.3.yaml'
      );
      const shrinkwrapFile: BaseShrinkwrapFile = ShrinkwrapFileFactory.getShrinkwrapFile({
        packageManager: 'pnpm',
        shrinkwrapFilePath,
        subspaceHasNoProjects: false
      })!;

      validateWorkspaceLockfile(shrinkwrapFile);
      expect(shrinkwrapFile.isWorkspaceCompatible).toBe(true);
    });

    describe('V9 lockfile', () => {
      const shrinkwrapFilePath: string = path.resolve(
        __dirname,
        '../../../src/logic/test/shrinkwrapFile/workspace-pnpm-lock-v9.yaml'
      );

      const shrinkwrapFile: BaseShrinkwrapFile = ShrinkwrapFileFactory.getShrinkwrapFile({
        packageManager: 'pnpm',
        shrinkwrapFilePath,
        subspaceHasNoProjects: false
      })!;

      validateWorkspaceLockfile(shrinkwrapFile);
      expect(shrinkwrapFile.isWorkspaceCompatible).toBe(true);
    });

    describe('V9 lockfile with no projects', () => {
      const shrinkwrapFilePath: string = path.resolve(
        __dirname,
        '../../../src/logic/test/shrinkwrapFile/workspace-pnpm-lock-no-projects-v9.yaml'
      );

      const shrinkwrapFile: BaseShrinkwrapFile = ShrinkwrapFileFactory.getShrinkwrapFile({
        packageManager: 'pnpm',
        shrinkwrapFilePath,
        subspaceHasNoProjects: true
      })!;

      expect(shrinkwrapFile.isWorkspaceCompatible).toBe(true);
    });
  });
});

function testParsePnpmDependencyKey(packageName: string, key: string): string | undefined {
  const specifier: DependencySpecifier | undefined = parsePnpmDependencyKey(packageName, key);
  if (!specifier) {
    return undefined;
  }
  return specifier.versionSpecifier;
}

describe(parsePnpmDependencyKey.name, () => {
  it('extracts a simple version with no slashes', () => {
    expect(testParsePnpmDependencyKey('anonymous', '0.0.5')).toEqual('0.0.5');
  });
  it('extracts a simple package name', () => {
    expect(testParsePnpmDependencyKey('isarray', '/isarray/2.0.5')).toEqual('2.0.5');
    expect(testParsePnpmDependencyKey('@scope/test-dep', '/@scope/test-dep/1.2.3-beta.3')).toEqual(
      '1.2.3-beta.3'
    );
  });
  it('extracts a registry-qualified path', () => {
    expect(
      testParsePnpmDependencyKey('@scope/test-dep', 'example.pkgs.visualstudio.com/@scope/test-dep/1.0.0')
    ).toEqual('1.0.0');
    expect(
      testParsePnpmDependencyKey(
        '@scope/test-dep',
        'example.pkgs.visualstudio.com/@scope/test-dep/1.2.3-beta.3'
      )
    ).toEqual('1.2.3-beta.3');
  });
  it('extracts a V3 peer dependency path', () => {
    expect(testParsePnpmDependencyKey('gulp-karma', '/gulp-karma/0.0.5/karma@0.13.22')).toEqual('0.0.5');
    expect(testParsePnpmDependencyKey('sinon-chai', '/sinon-chai/2.8.0/chai@3.5.0+sinon@1.17.7')).toEqual(
      '2.8.0'
    );
    expect(
      testParsePnpmDependencyKey('@ms/sp-client-utilities', '/@ms/sp-client-utilities/3.1.1/foo@13.1.0')
    ).toEqual('3.1.1');
    expect(
      testParsePnpmDependencyKey(
        'tslint-microsoft-contrib',
        '/tslint-microsoft-contrib/6.2.0/tslint@5.18.0+typescript@3.5.3'
      )
    ).toEqual('6.2.0');
  });
  it('extracts a V5 peer dependency path', () => {
    expect(testParsePnpmDependencyKey('anonymous', '23.6.0_babel-core@6.26.3')).toEqual('23.6.0');
    expect(testParsePnpmDependencyKey('anonymous', '1.0.7_request@2.88.0')).toEqual('1.0.7');
    expect(testParsePnpmDependencyKey('anonymous', '1.0.3_@pnpm+logger@1.0.2')).toEqual('1.0.3');
    expect(
      testParsePnpmDependencyKey(
        'tslint-microsoft-contrib',
        '/tslint-microsoft-contrib/6.2.0_tslint@5.18.0+typescript@3.5.3'
      )
    ).toEqual('6.2.0');
  });
  it('detects NPM package aliases', () => {
    expect(testParsePnpmDependencyKey('alias1', '/isarray/2.0.5')).toEqual('npm:isarray@2.0.5');
    expect(testParsePnpmDependencyKey('alias2', '/@ms/sp-client-utilities/3.1.1/foo@13.1.0')).toEqual(
      'npm:@ms/sp-client-utilities@3.1.1'
    );
  });
  it('detects urls', () => {
    expect(
      testParsePnpmDependencyKey('example', '@github.com/abc/def/abcdef2fbd0260e6e56ed5ba34df0f5b6599bbe64')
    ).toEqual('@github.com/abc/def/abcdef2fbd0260e6e56ed5ba34df0f5b6599bbe64');
    expect(
      testParsePnpmDependencyKey('example', 'github.com/abc/def/abcdef2fbd0260e6e56ed5ba34df0f5b6599bbe64')
    ).toEqual('github.com/abc/def/abcdef2fbd0260e6e56ed5ba34df0f5b6599bbe64');
    expect(
      testParsePnpmDependencyKey('example', 'bitbucket.com/abc/def/abcdef2fbd0260e6e56ed5ba34df0f5b6599bbe64')
    ).toEqual('bitbucket.com/abc/def/abcdef2fbd0260e6e56ed5ba34df0f5b6599bbe64');
    expect(
      testParsePnpmDependencyKey(
        'example',
        'microsoft.github.com/abc/def/abcdef2fbd0260e6e56ed5ba34df0f5b6599bbe64'
      )
    ).toEqual('microsoft.github.com/abc/def/abcdef2fbd0260e6e56ed5ba34df0f5b6599bbe64');
    expect(
      testParsePnpmDependencyKey(
        'example',
        'microsoft.github/.com/abc/def/abcdef2fbd0260e6e56ed5ba34df0f5b6599bbe64'
      )
    ).toEqual('microsoft.github/.com/abc/def/abcdef2fbd0260e6e56ed5ba34df0f5b6599bbe64');
    expect(
      testParsePnpmDependencyKey('example', 'ab.cd.ef.gh/ijkl/abcdef2fbd0260e6e56ed5ba34df0f5b6599bbe64')
    ).toEqual('ab.cd.ef.gh/ijkl/abcdef2fbd0260e6e56ed5ba34df0f5b6599bbe64');
    expect(testParsePnpmDependencyKey('example', 'ab.cd/ef')).toEqual('ab.cd/ef');
  });
  it('handles bad cases', () => {
    expect(testParsePnpmDependencyKey('example', '/foo/gulp-karma/0.0.5/karma@0.13.22')).toEqual(undefined);
    expect(testParsePnpmDependencyKey('example', '/@ms/3.1.1/foo@13.1.0')).toEqual(undefined);
    expect(testParsePnpmDependencyKey('example', 'file:projects/my-app.tgz')).toEqual(undefined);
    expect(testParsePnpmDependencyKey('example', '')).toEqual(undefined);
    expect(testParsePnpmDependencyKey('example', '/')).toEqual(undefined);
    expect(testParsePnpmDependencyKey('example', '//')).toEqual(undefined);
    expect(testParsePnpmDependencyKey('example', '/@/')).toEqual(undefined);
    expect(testParsePnpmDependencyKey('example', 'example.pkgs.visualstudio.com/@scope/testDep/')).toEqual(
      undefined
    );
    expect(
      testParsePnpmDependencyKey(
        'example',
        'microsoft.github.com/abc\\def/abcdef2fbd0260e6e56ed5ba34df0f5b6599bbe64'
      )
    ).toEqual(undefined);
    expect(
      testParsePnpmDependencyKey(
        'example',
        'microsoft.github.com/abc/def//abcdef2fbd0260e6e56ed5ba34df0f5b6599bbe64'
      )
    ).toEqual(undefined);
    expect(
      testParsePnpmDependencyKey(
        'example',
        'microsoft./github.com/abc/def/abcdef2fbd0260e6e56ed5ba34df0f5b6599bbe64'
      )
    ).toEqual(undefined);
    expect(
      testParsePnpmDependencyKey(
        'example',
        'microsoft/abc/github/abc/def/abcdef2fbd0260e6e56ed5ba34df0f5b6599bbe64'
      )
    ).toEqual(undefined);
    expect(testParsePnpmDependencyKey('example', 'ab.cd/ef/')).toEqual(undefined);
  });
});
