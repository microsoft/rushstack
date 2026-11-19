// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';

import { FileSystem } from '@rushstack/node-core-library';

import { readResidentMemoryBytes } from '../readResidentMemoryBytes';

const FALLBACK_BYTES: number = 123456789;

// The format of /proc/<pid>/status, in which every memory line has its own value.
const STATUS_TEXT: string = [
  'Name:\tnode',
  'VmPeak:\t    9500 kB',
  'VmSize:\t    9000 kB',
  'VmLck:\t       0 kB',
  'VmHWM:\t    2000 kB',
  'VmRSS:\t    1500 kB',
  'RssAnon:\t     900 kB',
  'RssFile:\t     500 kB',
  'RssShmem:\t     100 kB',
  'Threads:\t11',
  ''
].join('\n');

function readVmRssBytes(): number {
  const kibibytes: string | undefined = /^VmRSS:\s*(\d+)\s+kB$/m.exec(
    fs.readFileSync('/proc/self/status', 'utf8')
  )?.[1];
  return Number(kibibytes) * 1024;
}

describe(readResidentMemoryBytes.name, () => {
  const platformDescriptor: PropertyDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')!;

  function setPlatform(platform: NodeJS.Platform): void {
    Object.defineProperty(process, 'platform', { ...platformDescriptor, value: platform });
  }

  afterEach(() => {
    Object.defineProperty(process, 'platform', platformDescriptor);
    jest.restoreAllMocks();
  });

  (process.platform === 'linux' ? it : it.skip)('matches VmRSS from /proc/self/status on Linux', () => {
    const before: number = readVmRssBytes();
    const bytes: number = readResidentMemoryBytes();
    const after: number = readVmRssBytes();

    expect(bytes % 1024).toBe(0);
    expect(bytes).toBeGreaterThanOrEqual(Math.min(before, after));
    expect(bytes).toBeLessThanOrEqual(Math.max(before, after));
  });

  describe('with a mocked /proc/self/status', () => {
    let readFileMock: jest.SpyInstance<string, Parameters<typeof FileSystem.readFile>>;

    beforeEach(() => {
      setPlatform('linux');
      readFileMock = jest.spyOn(FileSystem, 'readFile').mockReturnValue(STATUS_TEXT);
      jest.spyOn(process.memoryUsage, 'rss').mockReturnValue(FALLBACK_BYTES);
    });

    it('returns VmRSS in bytes', () => {
      expect(readResidentMemoryBytes()).toBe(1536000);
      expect(readFileMock).toHaveBeenCalledTimes(1);
      expect(readFileMock).toHaveBeenCalledWith('/proc/self/status');
    });

    it('falls back to process.memoryUsage.rss() if the file cannot be read', () => {
      readFileMock.mockImplementation(() => {
        throw Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' });
      });

      expect(readResidentMemoryBytes()).toBe(FALLBACK_BYTES);
    });

    it('falls back to process.memoryUsage.rss() if there is no VmRSS line', () => {
      readFileMock.mockReturnValue(STATUS_TEXT.replace('VmRSS:\t    1500 kB\n', ''));

      expect(readResidentMemoryBytes()).toBe(FALLBACK_BYTES);
    });

    it('falls back to process.memoryUsage.rss() if VmRSS is 0', () => {
      readFileMock.mockReturnValue(STATUS_TEXT.replace('VmRSS:\t    1500 kB', 'VmRSS:\t       0 kB'));

      expect(readResidentMemoryBytes()).toBe(FALLBACK_BYTES);
    });

    it.each(['darwin', 'win32'] as const)(
      'returns process.memoryUsage.rss() without reading the file on %s',
      (platform: NodeJS.Platform) => {
        setPlatform(platform);

        expect(readResidentMemoryBytes()).toBe(FALLBACK_BYTES);
        expect(readFileMock).not.toHaveBeenCalled();
      }
    );
  });
});
