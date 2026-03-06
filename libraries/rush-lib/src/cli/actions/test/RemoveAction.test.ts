// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import '../../test/mockRushCommandLineParser.ts';

import { LockFile } from '@rushstack/node-core-library';

import { PackageJsonUpdater } from '../../../logic/PackageJsonUpdater.ts';
import type { IPackageJsonUpdaterRushRemoveOptions } from '../../../logic/PackageJsonUpdaterTypes.ts';
import { RushCommandLineParser } from '../../RushCommandLineParser.ts';
import { RemoveAction } from '../RemoveAction.ts';
import { VersionMismatchFinderProject } from '../../../logic/versionMismatch/VersionMismatchFinderProject.ts';
import { DependencyType } from '../../../api/PackageJsonEditor.ts';
import { EnvironmentConfiguration } from '../../../api/EnvironmentConfiguration.ts';

describe(RemoveAction.name, () => {
  describe('basic "rush remove" tests', () => {
    let doRushRemoveMock: jest.SpyInstance;
    let removeDependencyMock: jest.SpyInstance;
    let oldExitCode: number | string | undefined;
    let oldArgs: string[];

    beforeEach(() => {
      removeDependencyMock = jest
        .spyOn(VersionMismatchFinderProject.prototype, 'removeDependency')
        .mockImplementation(() => {});

      jest.spyOn(process, 'exit').mockImplementation();

      // Suppress "Another Rush command is already running" error
      jest.spyOn(LockFile, 'tryAcquire').mockImplementation(() => ({}) as LockFile);

      oldExitCode = process.exitCode;
      oldArgs = process.argv;
    });

    afterEach(() => {
      jest.clearAllMocks();
      process.exitCode = oldExitCode;
      process.argv = oldArgs;
      EnvironmentConfiguration.reset();
    });

    describe("'remove' action", () => {
      it(`remove a dependency that is listed as both dependency of different types`, async () => {
        const startPath: string = `${__dirname}/removeRepo`;
        const cPath: string = `${__dirname}/removeRepo/c`;

        // Create a Rush CLI instance. This instance is heavy-weight and relies on setting process.exit
        // to exit and clear the Rush file lock. So running multiple `it` or `describe` test blocks over the same test
        // repo will fail due to contention over the same lock which is kept until the test runner process
        // ends.
        const parser: RushCommandLineParser = new RushCommandLineParser({ cwd: startPath });

        // Switching to the "c" package of removeRepo
        jest.spyOn(process, 'cwd').mockReturnValue(cPath);

        // Mock the command
        process.argv = ['pretend-this-is-node.exe', 'pretend-this-is-rush', 'remove', '-p', 'assert', '-s'];

        await expect(parser.executeAsync()).resolves.toEqual(true);
        expect(removeDependencyMock).toHaveBeenCalledTimes(2);
        const packageName: string = removeDependencyMock.mock.calls[0][0];
        expect(packageName).toEqual('assert');
        const dependencyType1: DependencyType = removeDependencyMock.mock.calls[0][1];
        expect(dependencyType1).toEqual(DependencyType.Regular);
        const dependencyType2: DependencyType = removeDependencyMock.mock.calls[1][1];
        expect(dependencyType2).toEqual(DependencyType.Dev);
      });
      it(`remove a dependency to just one repo in the workspace`, async () => {
        const startPath: string = `${__dirname}/removeRepo`;
        const aPath: string = `${__dirname}/removeRepo/a`;
        doRushRemoveMock = jest
          .spyOn(PackageJsonUpdater.prototype, 'doRushUpdateAsync')
          .mockImplementation(() => Promise.resolve());

        // Create a Rush CLI instance. This instance is heavy-weight and relies on setting process.exit
        // to exit and clear the Rush file lock. So running multiple `it` or `describe` test blocks over the same test
        // repo will fail due to contention over the same lock which is kept until the test runner process
        // ends.
        const parser: RushCommandLineParser = new RushCommandLineParser({ cwd: startPath });

        // Switching to the "a" package of removeRepo
        jest.spyOn(process, 'cwd').mockReturnValue(aPath);

        // Mock the command
        process.argv = ['pretend-this-is-node.exe', 'pretend-this-is-rush', 'remove', '-p', 'assert'];

        await expect(parser.executeAsync()).resolves.toEqual(true);
        expect(doRushRemoveMock).toHaveBeenCalledTimes(1);
        const doRushRemoveOptions: IPackageJsonUpdaterRushRemoveOptions = doRushRemoveMock.mock.calls[0][0];
        expect(doRushRemoveOptions.projects).toHaveLength(1);
        expect(doRushRemoveOptions.projects[0].packageName).toEqual('a');
        expect(doRushRemoveOptions.packagesToUpdate).toMatchInlineSnapshot(`
          Array [
            Object {
              "packageName": "assert",
            },
          ]
        `);
      });
    });

    describe("'remove' action with --all", () => {
      it(`remove a dependency from all repos in the workspace`, async () => {
        const startPath: string = `${__dirname}/removeRepo`;
        const aPath: string = `${__dirname}/removeRepo/a`;

        doRushRemoveMock = jest
          .spyOn(PackageJsonUpdater.prototype, 'doRushUpdateAsync')
          .mockImplementation(() => Promise.resolve());

        // Create a Rush CLI instance. This instance is heavy-weight and relies on setting process.exit
        // to exit and clear the Rush file lock. So running multiple `it` or `describe` test blocks over the same test
        // repo will fail due to contention over the same lock which is kept until the test runner process
        // ends.
        const parser: RushCommandLineParser = new RushCommandLineParser({ cwd: startPath });

        // Switching to the "a" package of addRepo
        jest.spyOn(process, 'cwd').mockReturnValue(aPath);

        // Mock the command
        process.argv = [
          'pretend-this-is-node.exe',
          'pretend-this-is-rush',
          'remove',
          '-p',
          'assert',
          '--all'
        ];

        await expect(parser.executeAsync()).resolves.toEqual(true);
        expect(doRushRemoveMock).toHaveBeenCalledTimes(1);
        const doRushRemoveOptions: IPackageJsonUpdaterRushRemoveOptions = doRushRemoveMock.mock.calls[0][0];
        expect(doRushRemoveOptions.projects).toHaveLength(3);
        expect(doRushRemoveOptions.projects[0].packageName).toEqual('a');
        expect(doRushRemoveOptions.projects[1].packageName).toEqual('b');
        expect(doRushRemoveOptions.projects[2].packageName).toEqual('c');
        expect(doRushRemoveOptions.packagesToUpdate).toMatchInlineSnapshot(`
          Array [
            Object {
              "packageName": "assert",
            },
          ]
        `);
      });
    });
  });
});
