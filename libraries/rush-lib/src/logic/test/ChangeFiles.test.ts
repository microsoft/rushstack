// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Path } from '@rushstack/node-core-library';

import type { IChangelog } from '../../api/Changelog';
import { ChangeFiles } from '../ChangeFiles';
import type { RushConfiguration } from '../../api/RushConfiguration';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { VersionPolicyDefinitionName } from '../../api/VersionPolicy';
import type { ExperimentsConfiguration } from '../../api/ExperimentsConfiguration';
import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';

describe(ChangeFiles.name, () => {
  let rushConfiguration: RushConfiguration;

  let terminalProvider: StringBufferTerminalProvider;
  let terminal: Terminal;

  beforeEach(() => {
    rushConfiguration = {
      experimentsConfiguration: {
        configuration: {}
      }
    } as RushConfiguration;

    terminalProvider = new StringBufferTerminalProvider();
    terminal = new Terminal(terminalProvider);
  });

  afterEach(() => {
    expect(
      terminalProvider
        .getAllOutputAsChunks({ asLines: true })
        .map((chunk) => chunk.replace(__dirname, '<TEST DIR>'))
    ).toMatchSnapshot();
  });

  describe(ChangeFiles.prototype.getFilesAsync.name, () => {
    it('returns correctly when there is one change file', async () => {
      const changesPath: string = `${__dirname}/leafChange`;
      const changeFiles: ChangeFiles = new ChangeFiles(changesPath);
      const expectedPath: string = Path.convertToSlashes(`${changesPath}/change1.json`);
      expect(await changeFiles.getFilesAsync()).toEqual([expectedPath]);
    });

    it('returns empty array when no change files', async () => {
      const changesPath: string = `${__dirname}/noChange`;
      const changeFiles: ChangeFiles = new ChangeFiles(changesPath);
      expect(await changeFiles.getFilesAsync()).toHaveLength(0);
    });

    it('returns correctly when change files are categorized', async () => {
      const changesPath: string = `${__dirname}/categorizedChanges`;
      const changeFiles: ChangeFiles = new ChangeFiles(changesPath);
      const files: string[] = await changeFiles.getFilesAsync();
      expect(files).toHaveLength(3);

      const expectedPathA: string = Path.convertToSlashes(`${changesPath}/@ms/a/changeA.json`);
      const expectedPathB: string = Path.convertToSlashes(`${changesPath}/@ms/b/changeB.json`);
      const expectedPathC: string = Path.convertToSlashes(`${changesPath}/changeC.json`);
      expect(files).toContain(expectedPathA);
      expect(files).toContain(expectedPathB);
      expect(files).toContain(expectedPathC);
    });
  });

  describe(ChangeFiles.validateAsync.name, () => {
    it('throws when there is a patch in a hotfix branch.', async () => {
      const changeFile: string = `${__dirname}/leafChange/change1.json`;
      const changedPackages: string[] = ['d'];
      await expect(
        ChangeFiles.validateAsync(terminal, [changeFile], changedPackages, {
          hotfixChangeEnabled: true
        } as RushConfiguration)
      ).rejects.toThrow(Error);
    });

    it('allows a hotfix in a hotfix branch.', async () => {
      const changeFile: string = `${__dirname}/multipleHotfixChanges/change1.json`;
      const changedPackages: string[] = ['a'];
      await ChangeFiles.validateAsync(terminal, [changeFile], changedPackages, {
        ...rushConfiguration,
        hotfixChangeEnabled: true
      } as RushConfiguration);
    });

    it('throws when there is any missing package.', async () => {
      const changeFile: string = `${__dirname}/verifyChanges/changes.json`;
      const changedPackages: string[] = ['a', 'b', 'c'];
      await expect(
        ChangeFiles.validateAsync(terminal, [changeFile], changedPackages, rushConfiguration)
      ).rejects.toThrow(Error);
    });

    it('does not throw when there is no missing packages', async () => {
      const changeFile: string = `${__dirname}/verifyChanges/changes.json`;
      const changedPackages: string[] = ['a'];
      await ChangeFiles.validateAsync(terminal, [changeFile], changedPackages, rushConfiguration);
    });

    it('throws when missing packages from categorized changes', async () => {
      const changeFileA: string = `${__dirname}/categorizedChanges/@ms/a/changeA.json`;
      const changeFileB: string = `${__dirname}/categorizedChanges/@ms/b/changeB.json`;
      const changedPackages: string[] = ['@ms/a', '@ms/b', 'c'];
      await expect(
        ChangeFiles.validateAsync(terminal, [changeFileA, changeFileB], changedPackages, rushConfiguration)
      ).rejects.toThrow(Error);
    });

    it('does not throw when no missing packages from categorized changes', async () => {
      const changeFileA: string = `${__dirname}/categorizedChanges/@ms/a/changeA.json`;
      const changeFileB: string = `${__dirname}/categorizedChanges/@ms/b/changeB.json`;
      const changeFileC: string = `${__dirname}/categorizedChanges/changeC.json`;
      const changedPackages: string[] = ['@ms/a', '@ms/b', 'c'];
      await ChangeFiles.validateAsync(
        terminal,
        [changeFileA, changeFileB, changeFileC],
        changedPackages,
        rushConfiguration
      );
    });

    describe('with strictChangefileValidation', () => {
      let strictConfig: RushConfiguration;

      function createStrictConfig(
        getProjectByName: (name: string) => RushConfigurationProject | undefined
      ): RushConfiguration {
        return {
          experimentsConfiguration: {
            configuration: { strictChangefileValidation: true }
          } as ExperimentsConfiguration,
          getProjectByName
        } as unknown as RushConfiguration;
      }

      it('throws when change file references a nonexistent project', async () => {
        const changeFile: string = `${__dirname}/strictValidation/nonexistentProject.json`;
        strictConfig = createStrictConfig(() => undefined);
        try {
          await ChangeFiles.validateAsync(terminal, [changeFile], ['nonexistent-package'], strictConfig);
          fail('Expected validateAsync to throw');
        } catch (error) {
          const normalizedMessage: string = error.message.replace(__dirname, '<TEST DIR>');
          expect(normalizedMessage).toMatchSnapshot();
        }
      });

      it('throws when change file references a non-main lockstep project', async () => {
        const changeFile: string = `${__dirname}/strictValidation/nonMainLockstep.json`;
        strictConfig = createStrictConfig((name: string) => {
          if (name === 'lockstep-secondary') {
            return {
              packageName: 'lockstep-secondary',
              versionPolicy: {
                policyName: 'myLockstep',
                definitionName: VersionPolicyDefinitionName.lockStepVersion,
                mainProject: 'lockstep-main'
              }
            } as unknown as RushConfigurationProject;
          }
          return undefined;
        });
        try {
          await ChangeFiles.validateAsync(terminal, [changeFile], ['lockstep-secondary'], strictConfig);
          fail('Expected validateAsync to throw');
        } catch (error) {
          const normalizedMessage: string = error.message.replace(__dirname, '<TEST DIR>');
          expect(normalizedMessage).toMatchSnapshot();
        }
      });

      it('does not throw when change file references the main lockstep project', async () => {
        const changeFile: string = `${__dirname}/strictValidation/mainLockstep.json`;
        strictConfig = createStrictConfig((name: string) => {
          if (name === 'lockstep-main') {
            return {
              packageName: 'lockstep-main',
              versionPolicy: {
                policyName: 'myLockstep',
                definitionName: VersionPolicyDefinitionName.lockStepVersion,
                mainProject: 'lockstep-main'
              }
            } as unknown as RushConfigurationProject;
          }
          return undefined;
        });
        await ChangeFiles.validateAsync(terminal, [changeFile], ['lockstep-main'], strictConfig);
      });

      it('does not throw when change file references a lockstep project with no mainProject', async () => {
        const changeFile: string = `${__dirname}/strictValidation/mainLockstep.json`;
        strictConfig = createStrictConfig((name: string) => {
          if (name === 'lockstep-main') {
            return {
              packageName: 'lockstep-main',
              versionPolicy: {
                policyName: 'myLockstep',
                definitionName: VersionPolicyDefinitionName.lockStepVersion,
                mainProject: undefined
              }
            } as unknown as RushConfigurationProject;
          }
          return undefined;
        });
        await ChangeFiles.validateAsync(terminal, [changeFile], ['lockstep-main'], strictConfig);
      });

      it('does not throw when experiment is disabled', async () => {
        const changeFile: string = `${__dirname}/strictValidation/nonexistentProject.json`;
        const config: RushConfiguration = {
          experimentsConfiguration: {
            configuration: { strictChangefileValidation: false }
          } as ExperimentsConfiguration
        } as unknown as RushConfiguration;
        await ChangeFiles.validateAsync(terminal, [changeFile], ['nonexistent-package'], config);
      });
    });
  });

  describe(ChangeFiles.prototype.deleteAllAsync.name, () => {
    it('delete all files when there are no prerelease packages', async () => {
      const changesPath: string = `${__dirname}/multipleChangeFiles`;
      const changeFiles: ChangeFiles = new ChangeFiles(changesPath);
      expect(await changeFiles.deleteAllAsync(terminal, false)).toEqual(3);
    });

    it('does not delete change files for package whose change logs do not get updated. ', async () => {
      const changesPath: string = `${__dirname}/multipleChangeFiles`;
      const changeFiles: ChangeFiles = new ChangeFiles(changesPath);
      const updatedChangelogs: IChangelog[] = [
        {
          name: 'a',
          entries: []
        },
        {
          name: 'b',
          entries: []
        }
      ];
      expect(await changeFiles.deleteAllAsync(terminal, false, updatedChangelogs)).toEqual(2);
    });

    it('delete all files when there are hotfixes', async () => {
      const changesPath: string = `${__dirname}/multipleHotfixChanges`;
      const changeFiles: ChangeFiles = new ChangeFiles(changesPath);
      expect(await changeFiles.deleteAllAsync(terminal, false)).toEqual(3);
    });
  });
});
