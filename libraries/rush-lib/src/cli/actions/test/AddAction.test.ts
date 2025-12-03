// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import '../../test/mockRushCommandLineParser';

import { LockFile } from '@rushstack/node-core-library';

import { PackageJsonUpdater } from '../../../logic/PackageJsonUpdater';
import type { IPackageJsonUpdaterRushAddOptions } from '../../../logic/PackageJsonUpdaterTypes';
import { RushCommandLineParser } from '../../RushCommandLineParser';
import { AddAction } from '../AddAction';
import { EnvironmentConfiguration } from '../../../api/EnvironmentConfiguration';

describe(AddAction.name, () => {
  describe('basic "rush add" tests', () => {
    let doRushAddMock: jest.SpyInstance;
    let oldExitCode: number | string | undefined;
    let oldArgs: string[];

    beforeEach(() => {
      doRushAddMock = jest
        .spyOn(PackageJsonUpdater.prototype, 'doRushUpdateAsync')
        .mockImplementation(() => Promise.resolve());
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

    describe("'add' action", () => {
      it(`adds a dependency to just one repo in the workspace`, async () => {
        const startPath: string = `${__dirname}/addRepo`;
        const aPath: string = `${__dirname}/addRepo/a`;

        // Create a Rush CLI instance. This instance is heavy-weight and relies on setting process.exit
        // to exit and clear the Rush file lock. So running multiple `it` or `describe` test blocks over the same test
        // repo will fail due to contention over the same lock which is kept until the test runner process
        // ends.
        const parser: RushCommandLineParser = new RushCommandLineParser({ cwd: startPath });

        // Switching to the "a" package of addRepo
        jest.spyOn(process, 'cwd').mockReturnValue(aPath);

        // Mock the command
        process.argv = ['pretend-this-is-node.exe', 'pretend-this-is-rush', 'add', '-p', 'assert'];

        await expect(parser.executeAsync()).resolves.toEqual(true);
        expect(doRushAddMock).toHaveBeenCalledTimes(1);
        const doRushAddOptions: IPackageJsonUpdaterRushAddOptions = doRushAddMock.mock.calls[0][0];
        expect(doRushAddOptions.projects).toHaveLength(1);
        expect(doRushAddOptions.projects[0].packageName).toEqual('a');
        expect(doRushAddOptions.packagesToUpdate).toMatchInlineSnapshot(`
          Array [
            Object {
              "packageName": "assert",
              "rangeStyle": "tilde",
              "version": undefined,
            },
          ]
        `);
      });
    });

    describe("'add' action with --all", () => {
      it(`adds a dependency to all repos in the workspace`, async () => {
        const startPath: string = `${__dirname}/addRepo`;
        const aPath: string = `${__dirname}/addRepo/a`;

        // Create a Rush CLI instance. This instance is heavy-weight and relies on setting process.exit
        // to exit and clear the Rush file lock. So running multiple `it` or `describe` test blocks over the same test
        // repo will fail due to contention over the same lock which is kept until the test runner process
        // ends.
        const parser: RushCommandLineParser = new RushCommandLineParser({ cwd: startPath });

        // Switching to the "a" package of addRepo
        jest.spyOn(process, 'cwd').mockReturnValue(aPath);

        // Mock the command
        process.argv = ['pretend-this-is-node.exe', 'pretend-this-is-rush', 'add', '-p', 'assert', '--all'];

        await expect(parser.executeAsync()).resolves.toEqual(true);
        expect(doRushAddMock).toHaveBeenCalledTimes(1);
        const doRushAddOptions: IPackageJsonUpdaterRushAddOptions = doRushAddMock.mock.calls[0][0];
        expect(doRushAddOptions.projects).toHaveLength(2);
        expect(doRushAddOptions.projects[0].packageName).toEqual('a');
        expect(doRushAddOptions.projects[1].packageName).toEqual('b');
        expect(doRushAddOptions.packagesToUpdate).toMatchInlineSnapshot(`
          Array [
            Object {
              "packageName": "assert",
              "rangeStyle": "tilde",
              "version": undefined,
            },
          ]
        `);
      });
    });
  });
});
