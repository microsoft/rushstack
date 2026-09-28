// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock('node:child_process', () => ({
  ...jest.requireActual('node:child_process'),
  execFile: jest.fn()
}));

import * as childProcess from 'node:child_process';

import { type ILinuxProcfsReader, waitForLinuxProcessGroupExitAsync } from '../LinuxProcessGroupExit';

const GROUP_ID: number = 123_456_789;
const execFileMock = jest.mocked(childProcess.execFile);
const gone = (): never => {
  throw Object.assign(new Error('No such process group'), { code: 'ESRCH' });
};
const NO_PROCFS: ILinuxProcfsReader = {
  listEntriesAsync: () => Promise.reject(Object.assign(new Error('No procfs'), { code: 'ENOENT' })),
  readStatAsync: () => Promise.reject(new Error('Unexpected procfs read'))
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

describe('Linux subprocess group completion (ps fallback without procfs)', () => {
  const waitAsync = (groupId: number, timeoutMs?: number): Promise<void> =>
    waitForLinuxProcessGroupExitAsync(groupId, timeoutMs, NO_PROCFS);

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
    await waitAsync(GROUP_ID);
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it('waits for live members rather than treating signal delivery as completion', async () => {
    let queries: number = 0;
    execFileMock.mockImplementation((...args) => reportPs(args, ++queries === 1 ? 'R\nZ\n' : 'Z\nZ\n'));
    await waitAsync(GROUP_ID);
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
    await waitAsync(GROUP_ID);
    expect(process.kill).toHaveBeenCalledTimes(2);
  });

  it('surfaces inspection failures instead of completing cleanup', async () => {
    const failure = Object.assign(new Error('Cannot execute ps'), { code: 'ENOENT' });
    execFileMock.mockImplementation((...args) => reportPs(args, '', failure));
    await expect(waitAsync(GROUP_ID)).rejects.toBe(failure);
  });

  it('rejects inspection diagnostics rather than trusting incomplete process state', async () => {
    execFileMock.mockImplementation((...args) => reportPs(args, 'Z\n', undefined, 'inspection warning'));
    await expect(waitAsync(GROUP_ID)).rejects.toThrow('inspection warning');
  });

  it('does not mistake permission denial for a released group', async () => {
    const failure = Object.assign(new Error('Permission denied'), { code: 'EPERM' });
    jest.mocked(process.kill).mockImplementation(() => {
      throw failure;
    });
    await expect(waitAsync(GROUP_ID)).rejects.toBe(failure);
  });

  it('bounds the wait for members that remain live', async () => {
    execFileMock.mockImplementation((...args) => reportPs(args, 'S\n'));
    await expect(waitAsync(GROUP_ID, 25)).rejects.toThrow('did not exit within 25ms');
  });

  it.each([0, -1, 1.5, process.pid])('rejects invalid or unowned group ID %s', async (pid) => {
    await expect(waitAsync(pid)).rejects.toThrow('owned child process group');
    expect(process.kill).not.toHaveBeenCalled();
  });
});

describe('Linux subprocess group completion (procfs)', () => {
  const procStat = (pid: number, state: string, session: number): string =>
    `${pid} (sh -c (x) y) ${state} 1 ${session} ${session} 0 -1 4194560`;
  let table: Map<string, string>;
  const fakeProcfs: ILinuxProcfsReader = {
    listEntriesAsync: async () => ['self', 'sys', ...table.keys()],
    readStatAsync: async (pid: string) => {
      const stat: string | undefined = table.get(pid);
      if (stat === undefined) throw Object.assign(new Error('gone'), { code: 'ENOENT' });
      return stat;
    }
  };
  const waitAsync = (timeoutMs?: number): Promise<void> =>
    waitForLinuxProcessGroupExitAsync(GROUP_ID, timeoutMs, fakeProcfs);

  beforeEach(() => {
    execFileMock.mockReset();
    jest.spyOn(process, 'kill').mockReturnValue(true);
    table = new Map();
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('completes from procfs without executing ps when only zombies remain', async () => {
    table = new Map([
      ['10', procStat(10, 'Z', GROUP_ID)],
      ['11', procStat(11, 'S', 42)]
    ]);
    await waitAsync();
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it('ignores members of other sessions whose command names look like session fields', async () => {
    table = new Map([
      ['10', procStat(10, 'Z', GROUP_ID)],
      ['11', `11 (x) S 1 ${GROUP_ID} ${GROUP_ID}) S 1 42 42 0 -1 4194560`]
    ]);
    await waitAsync();
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it('ignores members that exit between listing and reading', async () => {
    const reads: string[] = [];
    const racingProcfs: ILinuxProcfsReader = {
      listEntriesAsync: async () => ['10', '11'],
      readStatAsync: async (pid: string) => {
        reads.push(pid);
        if (pid === '11') throw Object.assign(new Error('gone'), { code: 'ENOENT' });
        return procStat(10, 'Z', GROUP_ID);
      }
    };
    await waitForLinuxProcessGroupExitAsync(GROUP_ID, undefined, racingProcfs);
    expect(reads.sort()).toEqual(['10', '11']);
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it('waits for live session members found in procfs', async () => {
    table = new Map([['10', procStat(10, 'R', GROUP_ID)]]);
    setTimeout(() => {
      table = new Map([['10', procStat(10, 'Z', GROUP_ID)]]);
    }, 30);
    await waitAsync();
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it('bounds the wait for live procfs members', async () => {
    table = new Map([['10', procStat(10, 'S', GROUP_ID)]]);
    await expect(waitAsync(25)).rejects.toThrow('did not exit within 25ms');
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it.each(['EACCES', 'EIO'])(
    'does not trust a zombie when another entry is unreadable (%s); falls back to ps',
    async (code) => {
      table = new Map([['10', procStat(10, 'Z', GROUP_ID)]]);
      const unreadableProcfs: ILinuxProcfsReader = {
        listEntriesAsync: async () => ['10', '11'],
        readStatAsync: async (pid: string) => {
          if (pid === '11') throw Object.assign(new Error('unreadable'), { code });
          return fakeProcfs.readStatAsync(pid);
        }
      };
      let queries: number = 0;
      execFileMock.mockImplementation((...args) => reportPs(args, ++queries === 1 ? 'S\nZ\n' : 'Z\nZ\n'));
      await waitForLinuxProcessGroupExitAsync(GROUP_ID, undefined, unreadableProcfs);
      expect(queries).toBe(2);
    }
  );

  it('surfaces the ps failure when an unreadable entry forces the fallback and ps is missing', async () => {
    const unreadableProcfs: ILinuxProcfsReader = {
      listEntriesAsync: async () => ['10', '11'],
      readStatAsync: async (pid: string) => {
        if (pid === '11') throw Object.assign(new Error('unreadable'), { code: 'EACCES' });
        return procStat(10, 'Z', GROUP_ID);
      }
    };
    const failure = Object.assign(new Error('spawn ps ENOENT'), { code: 'ENOENT' });
    execFileMock.mockImplementation((...args) => reportPs(args, '', failure));
    await expect(waitForLinuxProcessGroupExitAsync(GROUP_ID, undefined, unreadableProcfs)).rejects.toBe(
      failure
    );
  });

  it('treats ESRCH from a stat read as a vanished process', async () => {
    const racingProcfs: ILinuxProcfsReader = {
      listEntriesAsync: async () => ['10', '11'],
      readStatAsync: async (pid: string) => {
        if (pid === '11') throw Object.assign(new Error('gone'), { code: 'ESRCH' });
        return procStat(10, 'Z', GROUP_ID);
      }
    };
    await waitForLinuxProcessGroupExitAsync(GROUP_ID, undefined, racingProcfs);
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it('bounds concurrent stat reads and stops scanning after a live member', async () => {
    const pids: string[] = Array.from({ length: 200 }, (unused, index) => String(index + 1));
    let inFlight: number = 0;
    let maxInFlight: number = 0;
    let reads: number = 0;
    let live: boolean = true;
    const largeProcfs: ILinuxProcfsReader = {
      listEntriesAsync: async () => pids,
      readStatAsync: async (pid: string) => {
        reads++;
        maxInFlight = Math.max(maxInFlight, ++inFlight);
        await new Promise((resolve) => setImmediate(resolve));
        inFlight--;
        return pid === '1' ? procStat(1, live ? 'R' : 'Z', GROUP_ID) : procStat(Number(pid), 'S', 42);
      }
    };
    setTimeout(() => {
      live = false;
    }, 30);
    await waitForLinuxProcessGroupExitAsync(GROUP_ID, undefined, largeProcfs);
    expect(maxInFlight).toBeLessThanOrEqual(32);
    const scans: number = jest.mocked(process.kill).mock.calls.length;
    // Each scan while the member is live stops after the first batch; only the final scan reads everything.
    expect(scans).toBeGreaterThan(1);
    expect(reads).toBeLessThanOrEqual((scans - 1) * 32 + pids.length);
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it('does not depend on ps being installed while procfs is readable', async () => {
    execFileMock.mockImplementation((...args) =>
      reportPs(args, '', Object.assign(new Error('spawn ps ENOENT'), { code: 'ENOENT' }))
    );
    table = new Map([['10', procStat(10, 'Z', GROUP_ID)]]);
    await waitAsync();
    expect(execFileMock).not.toHaveBeenCalled();
  });
});
