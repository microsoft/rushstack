// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import fs from 'node:fs';

import { readResidentMemoryBytes } from '../DaemonResidentMemory';

const PROC_SELF_STATUS: string = '/proc/self/status';
const FALLBACK_BYTES: number = 777_777_777;
// As the kernel writes it: a tab after each key, and each value right-aligned in 8 columns.
const KERNEL_STATUS: string = [
  'Name:\tnode',
  'VmPeak:\t 9000000 kB',
  'VmSize:\t 8000000 kB',
  'VmHWM:\t  700000 kB',
  'VmRSS:\t  123456 kB',
  'RssAnon:\t  100000 kB',
  'RssFile:\t   20000 kB',
  'RssShmem:\t    3456 kB',
  'Threads:\t18',
  ''
].join('\n');

const linuxIt: jest.It = process.platform === 'linux' ? it : it.skip;

function readVmRssBytes(): number {
  const match: RegExpExecArray | null = /^VmRSS:\s*(\d+) kB$/m.exec(fs.readFileSync(PROC_SELF_STATUS, 'utf8'));
  return Number(match?.[1]) * 1024;
}

// Answers the reads of /proc/self/status in turn, with a text or by throwing, and passes every other read through.
function answerStatusReads(...answers: (string | Error)[]): jest.SpyInstance {
  const { readFileSync } = fs;
  return jest.spyOn(fs, 'readFileSync').mockImplementation(((
    ...args: Parameters<typeof readFileSync>
  ): string | Buffer => {
    const [file] = args;
    if (file !== PROC_SELF_STATUS) return readFileSync(...args);
    const answer: string | Error | undefined = answers.shift();
    if (answer instanceof Error) throw answer;
    return String(answer);
  }) as typeof readFileSync);
}

function createReadError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`${code}: cannot read ${PROC_SELF_STATUS}`), { code });
}

describe(readResidentMemoryBytes.name, () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  linuxIt('returns VmRSS, between the values read just before and just after it', () => {
    const before: number = readVmRssBytes();
    const bytes: number = readResidentMemoryBytes();
    const after: number = readVmRssBytes();
    expect(bytes).toBeGreaterThanOrEqual(Math.min(before, after));
    expect(bytes).toBeLessThanOrEqual(Math.max(before, after));
  });

  linuxIt("reads VmRSS's line in kibibytes, from a new read on each call", () => {
    const reads: jest.SpyInstance = answerStatusReads(
      KERNEL_STATUS,
      'VmHWM: 2000 kB\nVmRSS: 1500 kB\nVmSize: 9000 kB'
    );
    expect([readResidentMemoryBytes(), readResidentMemoryBytes()]).toEqual([126_418_944, 1_536_000]);
    expect(reads.mock.calls.filter(([file]) => file === PROC_SELF_STATUS)).toHaveLength(2);
  });

  linuxIt(
    'falls back to process.memoryUsage.rss() when /proc/self/status cannot be read or has no VmRSS value',
    () => {
      jest.spyOn(process.memoryUsage, 'rss').mockReturnValue(FALLBACK_BYTES);
      answerStatusReads(
        createReadError('ENOENT'),
        createReadError('EACCES'),
        KERNEL_STATUS.replace(/^VmRSS:.*\n/m, ''),
        KERNEL_STATUS.replace('123456', 'abc'),
        'garbage\n'
      );
      const readings: number[] = [1, 2, 3, 4, 5].map(() => readResidentMemoryBytes());
      expect(readings).toEqual([FALLBACK_BYTES, FALLBACK_BYTES, FALLBACK_BYTES, FALLBACK_BYTES, FALLBACK_BYTES]);
    }
  );

  it('throws when the fallback cannot read the resident memory either', () => {
    const error: Error = new Error('EMFILE: too many open files, uv_resident_set_memory');
    jest.spyOn(process.memoryUsage, 'rss').mockImplementation(() => {
      throw error;
    });
    answerStatusReads(createReadError('EMFILE'));
    expect(() => readResidentMemoryBytes()).toThrow(error);
  });

  it('returns process.memoryUsage.rss() on other platforms, without reading /proc', () => {
    const platform: PropertyDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')!;
    jest.spyOn(process.memoryUsage, 'rss').mockReturnValue(FALLBACK_BYTES);
    const reads: jest.SpyInstance = answerStatusReads(KERNEL_STATUS);
    Object.defineProperty(process, 'platform', { ...platform, value: 'darwin' });
    try {
      expect(readResidentMemoryBytes()).toBe(FALLBACK_BYTES);
    } finally {
      Object.defineProperty(process, 'platform', platform);
    }
    expect(reads.mock.calls.filter(([file]) => file === PROC_SELF_STATUS)).toHaveLength(0);
  });
});
