import '../../test/mockRushCommandLineParser';

import { RushCommandLineParser } from '../../RushCommandLineParser';
import { PublishAction } from '../PublishAction';
import { InstallManagerFactory } from '../../../logic/InstallManagerFactory';

describe(PublishAction.name, () => {
  describe('basic "rush publish" tests', () => {
    let oldExitCode: number | undefined;
    let oldArgs: string[];

    beforeEach(() => {
      jest.spyOn(process, 'exit').mockImplementation();
      oldExitCode = process.exitCode;
      oldArgs = process.argv;
    });

    afterEach(() => {
      jest.clearAllMocks();
      process.exitCode = oldExitCode;
      process.argv = oldArgs;
    });

    describe('publish action', () => {
      it('test without --update flag', async () => {
        const startPath: string = `${__dirname}/addRepo`;
        const aPath: string = `${__dirname}/addRepo/a`;

        // Create a Rush CLI instance. This instance is heavy-weight and relies on setting process.exit
        // to exit and clear the Rush file lock. So running multiple `it` or `describe` test blocks over the same test
        // repo will fail due to contention over the same lock which is kept until the test runner process
        // ends.
        const parser: RushCommandLineParser = new RushCommandLineParser({ cwd: startPath });

        // Switching to the "a" package of addRepo
        jest.spyOn(process, 'cwd').mockReturnValue(aPath);

        process.argv = ['pretend-this-is-node.exe', 'pretend-this-is-rush', 'publish'];

        const updateBeforeMock = jest
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .spyOn(PublishAction.prototype as any, '_updateBeforePublish')
          .mockImplementation(() => {});

        await expect(parser.execute()).resolves.toEqual(true);
        // No need to test the logic of _updateBeforePublish since it will exit
        // due to --update not being passed.
        expect(updateBeforeMock).toHaveBeenCalledTimes(1);
        updateBeforeMock.mockRestore();
      });

      it('tests updateBeforePublish', async () => {
        const startPath: string = `${__dirname}/addRepo`;
        const aPath: string = `${__dirname}/addRepo/a`;

        // Create a Rush CLI instance. This instance is heavy-weight and relies on setting process.exit
        // to exit and clear the Rush file lock. So running multiple `it` or `describe` test blocks over the same test
        // repo will fail due to contention over the same lock which is kept until the test runner process
        // ends.
        const parser: RushCommandLineParser = new RushCommandLineParser({ cwd: startPath });

        // Switching to the "a" package of addRepo
        jest.spyOn(process, 'cwd').mockReturnValue(aPath);

        process.argv = ['pretend-this-is-node.exe', 'pretend-this-is-rush', 'publish', '--update'];

        const doInstallAsync = jest.fn();
        const getInstallManagerMock = jest.fn().mockImplementation(() => {
          return {
            doInstallAsync
          };
        });
        InstallManagerFactory.getInstallManager = getInstallManagerMock;

        await expect(parser.execute()).resolves.toEqual(true);
        expect(getInstallManagerMock).toHaveBeenCalledTimes(1);
        expect(doInstallAsync).toHaveBeenCalledTimes(1);
      });
    });
  });
});
