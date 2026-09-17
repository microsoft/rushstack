// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock('node:child_process', () => ({
  ...jest.requireActual('node:child_process'),
  execFile: jest.fn()
}));

import * as childProcess from 'node:child_process';

import { waitForLinuxProcessGroupExitAsync } from '../LinuxProcessGroupExit';

const GROUP_ID: number = 123_456_789;
const execFileMock = jest.mocked(childProcess.execFile);
const gone = (): never => {
  throw Object.assign(new Error('No such process group'), { code: 'ESRCH' });
};

function reportPs(
  args: Parameters<typeof childProcess.execFile>,
  stdout: string,
  error: childProcess.ExecFileException | undefined = undefined,
  stderr: string = ''
): childProcess.ChildProcess {
  const callback = args.at(-1);
  if (typeof callback !== 'function') throw new Error('Expected a process-list callback.');
  callback(error ?? null, stdout, stderr);
  return new childProcess.ChildProcess();
}

describe('Linux subprocess group completion', () => {
  beforeEach(() => {
    execFileMock.mockReset();
    jest.spyOn(process, 'kill').mockReturnValue(true);
    execFileMock.mockImplementation((...args) => reportPs(args, 'Z\n'));
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('avoids process inspection when the captured group has disappeared', async () => {
    jest.mocked(process.kill).mockImplementation(gone);
    await waitForLinuxProcessGroupExitAsync(GROUP_ID);
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it('waits for live members rather than treating signal delivery as completion', async () => {
    let queries: number = 0;
    execFileMock.mockImplementation((...args) => reportPs(args, ++queries === 1 ? 'R\nZ\n' : 'Z\nZ\n'));
    await waitForLinuxProcessGroupExitAsync(GROUP_ID);
    expect(queries).toBe(2);
    expect(
      jest.mocked(process.kill).mock.calls.every(([pid, signal]) => pid === -GROUP_ID && signal === 0)
    ).toBe(true);
  });

  it('does not treat an empty inspection as disappearance while the group remains visible', async () => {
    jest.mocked(process.kill).mockReturnValueOnce(true).mockImplementationOnce(gone);
    execFileMock.mockImplementation((...args) =>
      reportPs(args, '', Object.assign(new Error('No matching processes'), { code: 1 }))
    );
    await waitForLinuxProcessGroupExitAsync(GROUP_ID);
    expect(process.kill).toHaveBeenCalledTimes(2);
  });

  it('surfaces inspection failures instead of completing cleanup', async () => {
    const failure = Object.assign(new Error('Cannot execute ps'), { code: 'ENOENT' });
    execFileMock.mockImplementation((...args) => reportPs(args, '', failure));
    await expect(waitForLinuxProcessGroupExitAsync(GROUP_ID)).rejects.toBe(failure);
  });

  it('rejects inspection diagnostics rather than trusting incomplete process state', async () => {
    execFileMock.mockImplementation((...args) => reportPs(args, 'Z\n', undefined, 'inspection warning'));
    await expect(waitForLinuxProcessGroupExitAsync(GROUP_ID)).rejects.toThrow('inspection warning');
  });

  it('does not mistake permission denial for a released group', async () => {
    const failure = Object.assign(new Error('Permission denied'), { code: 'EPERM' });
    jest.mocked(process.kill).mockImplementation(() => {
      throw failure;
    });
    await expect(waitForLinuxProcessGroupExitAsync(GROUP_ID)).rejects.toBe(failure);
  });

  it('bounds the wait for members that remain live', async () => {
    execFileMock.mockImplementation((...args) => reportPs(args, 'S\n'));
    await expect(waitForLinuxProcessGroupExitAsync(GROUP_ID, 25)).rejects.toThrow('did not exit within 25ms');
  });

  it.each([0, -1, 1.5, process.pid])('rejects invalid or unowned group ID %s', async (pid) => {
    await expect(waitForLinuxProcessGroupExitAsync(pid)).rejects.toThrow('owned child process group');
    expect(process.kill).not.toHaveBeenCalled();
  });
});
