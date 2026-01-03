// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import process from 'node:process';

import { Npm } from '../Npm';
import { Utilities } from '../Utilities';

describe(Npm.name, () => {
  const packageName: string = '@microsoft/rush-lib-never';
  let stub: jest.SpyInstance;

  beforeEach(() => {
    stub = jest.spyOn(Utilities, 'executeCommandAndCaptureOutputAsync');
  });

  afterEach(() => {
    stub.mockReset();
    stub.mockRestore();
  });

  it('publishedVersions gets versions when package time is available.', async () => {
    const json: string = `{
      "modified": "2017-03-30T18:37:27.757Z",
      "created": "2017-01-03T20:28:10.342Z",
      "0.0.0": "2017-01-03T20:28:10.342Z",
      "1.4.0": "2017-01-03T21:55:21.249Z",
      "1.4.1": "2017-01-09T19:22:00.488Z",
      "2.4.0-alpha.1": "2017-03-30T18:37:27.757Z"
    }`;
    stub.mockImplementationOnce(() =>
      Promise.resolve({ stdout: json, stderr: '', signal: undefined, exitCode: 0 })
    );

    const versions: string[] = await Npm.getPublishedVersionsAsync(packageName, __dirname, process.env);

    expect(stub).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'npm',
        args: `view ${packageName} time --json`.split(' ')
      })
    );

    expect(versions).toHaveLength(4);
    expect(versions).toMatchObject(['0.0.0', '1.4.0', '1.4.1', '2.4.0-alpha.1']);
  });

  it('publishedVersions gets versions when package time is not available', async () => {
    const json: string = `[
      "0.0.0",
      "1.4.0",
      "1.4.1",
      "2.4.0-alpha.1"
    ]`;
    stub.mockImplementationOnce(() =>
      Promise.resolve({ stdout: '', stderr: '', signal: undefined, exitCode: 0 })
    );
    stub.mockImplementationOnce(() =>
      Promise.resolve({ stdout: json, stderr: '', signal: undefined, exitCode: 0 })
    );

    const versions: string[] = await Npm.getPublishedVersionsAsync(packageName, __dirname, process.env);

    expect(stub).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'npm',
        args: `view ${packageName} time --json`.split(' ')
      })
    );
    expect(stub).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'npm',
        args: `view ${packageName} versions --json`.split(' ')
      })
    );

    expect(versions).toHaveLength(4);
    expect(versions).toMatchObject(['0.0.0', '1.4.0', '1.4.1', '2.4.0-alpha.1']);
  });
});
