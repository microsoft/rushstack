// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  classifyLocallyModifiedFiles,
  type GitStatusKind,
  isWindowsReservedPath,
  parseGitStatus,
  parseGitVersion
} from '../getRepoState';

describe(parseGitVersion.name, () => {
  it('Can parse valid git version responses', () => {
    expect(parseGitVersion('git version 2.30.2.windows.1')).toEqual({
      major: 2,
      minor: 30,
      patch: 2
    });
    expect(parseGitVersion('git version 2.30.2.windows.1.g8b8f8e')).toEqual({
      major: 2,
      minor: 30,
      patch: 2
    });
    expect(parseGitVersion('git version 2.30.2')).toEqual({
      major: 2,
      minor: 30,
      patch: 2
    });
  });

  it('Rejects invalid git version responses', () => {
    expect(() => parseGitVersion('2.22.0.windows.1')).toThrowErrorMatchingInlineSnapshot(
      `"While validating the Git installation, the \\"git version\\" command produced unexpected output: \\"2.22.0.windows.1\\""`
    );
    expect(() => parseGitVersion('git version 2.30.A')).toThrowErrorMatchingInlineSnapshot(
      `"While validating the Git installation, the \\"git version\\" command produced unexpected output: \\"git version 2.30.A\\""`
    );
    expect(() => parseGitVersion('git version 2.30')).toThrowErrorMatchingInlineSnapshot(
      `"While validating the Git installation, the \\"git version\\" command produced unexpected output: \\"git version 2.30\\""`
    );
    expect(() => parseGitVersion('git version .2.30')).toThrowErrorMatchingInlineSnapshot(
      `"While validating the Git installation, the \\"git version\\" command produced unexpected output: \\"git version .2.30\\""`
    );
  });
});

describe(parseGitStatus.name, () => {
  it('Finds index entries', () => {
    const input: string = [`A  A.ts`, `D  B.ts`, `M  C.ts`, `T  D.ts`, ''].join('\0');

    const result: Map<string, GitStatusKind> = parseGitStatus(input);

    expect(Array.from(result)).toEqual([
      ['A.ts', 'indexOnly'],
      ['B.ts', 'deleted'],
      ['C.ts', 'indexOnly'],
      ['D.ts', 'indexOnly']
    ]);
  });

  it('Finds working tree entries', () => {
    const input: string = [` A A.ts`, ` D B.ts`, ` M C.ts`, ` T D.ts`, ''].join('\0');

    const result: Map<string, GitStatusKind> = parseGitStatus(input);

    expect(Array.from(result)).toEqual([
      ['A.ts', 'workingTree'],
      ['B.ts', 'deleted'],
      ['C.ts', 'workingTree'],
      ['D.ts', 'workingTree']
    ]);
  });

  it('Can handle untracked files', () => {
    const input: string = [`?? A.ts`, `?? B.ts`, `?? C.ts`, ''].join('\0');

    const result: Map<string, GitStatusKind> = parseGitStatus(input);

    expect(Array.from(result)).toEqual([
      ['A.ts', 'workingTree'],
      ['B.ts', 'workingTree'],
      ['C.ts', 'workingTree']
    ]);
  });

  it('Can handle files modified in both index and working tree', () => {
    const input: string = [`D  A.ts`, `AD B.ts`, `DA C.ts`, `MM D.ts`, `UU E.ts`, ''].join('\0');

    const result: Map<string, GitStatusKind> = parseGitStatus(input);

    expect(Array.from(result)).toEqual([
      ['A.ts', 'deleted'],
      ['B.ts', 'deleted'],
      ['C.ts', 'workingTree'],
      ['D.ts', 'workingTree'],
      ['E.ts', 'workingTree']
    ]);
  });
});

describe(isWindowsReservedPath.name, () => {
  it('detects bare reserved basenames', () => {
    expect(isWindowsReservedPath('nul')).toBe(true);
    expect(isWindowsReservedPath('NUL')).toBe(true);
    expect(isWindowsReservedPath('Con')).toBe(true);
    expect(isWindowsReservedPath('com1')).toBe(true);
    expect(isWindowsReservedPath('LPT9')).toBe(true);
  });

  it('detects reserved basenames with an extension', () => {
    expect(isWindowsReservedPath('nul.txt')).toBe(true);
    expect(isWindowsReservedPath('aux.log.bak')).toBe(true);
  });

  it('matches the final segment of nested paths with either slash style', () => {
    expect(isWindowsReservedPath('apps/admin/nul')).toBe(true);
    expect(isWindowsReservedPath('apps\\admin\\nul')).toBe(true);
    expect(isWindowsReservedPath('apps/admin/sub/CON.tmp')).toBe(true);
  });

  it('does not match non-reserved names', () => {
    expect(isWindowsReservedPath('null')).toBe(false);
    expect(isWindowsReservedPath('console.ts')).toBe(false);
    expect(isWindowsReservedPath('com.ts')).toBe(false);
    expect(isWindowsReservedPath('lpt10')).toBe(false);
    expect(isWindowsReservedPath('packages/nul-suffix/index.ts')).toBe(false);
  });
});

describe(classifyLocallyModifiedFiles.name, () => {
  const platformDescriptor: PropertyDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')!;

  // "nul" is a reserved name on Windows
  const locallyModified: ReadonlyMap<string, GitStatusKind> = new Map<string, GitStatusKind>([
    ['modified.txt', 'workingTree'],
    ['deleted.txt', 'deleted'],
    ['link', 'workingTree'],
    ['deleted-link', 'deleted'],
    ['apps/nul', 'workingTree'],
    ['apps/con.txt', 'deleted'],
    ['staged.txt', 'indexOnly'],
    ['staged-link', 'indexOnly']
  ]);
  const symlinks: ReadonlyMap<string, string> = new Map([
    ['link', 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391'],
    ['deleted-link', 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391'],
    ['staged-link', 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391']
  ]);

  afterEach(() => {
    Object.defineProperty(process, 'platform', platformDescriptor);
  });

  it('hashes the files that exist, and removes the deleted files and the symbolic links', () => {
    Object.defineProperty(process, 'platform', { ...platformDescriptor, value: 'linux' });
    expect(classifyLocallyModifiedFiles(locallyModified, symlinks)).toEqual({
      filesToHash: ['modified.txt', 'apps/nul'],
      filesToRemove: ['deleted.txt', 'link', 'deleted-link', 'apps/con.txt']
    });
  });

  it('neither hashes nor removes a file with a reserved name on Windows', () => {
    Object.defineProperty(process, 'platform', { ...platformDescriptor, value: 'win32' });
    expect(classifyLocallyModifiedFiles(locallyModified, symlinks)).toEqual({
      filesToHash: ['modified.txt'],
      filesToRemove: ['deleted.txt', 'link', 'deleted-link', 'apps/con.txt']
    });
  });

  it('neither hashes nor removes a path whose working tree column is blank', () => {
    Object.defineProperty(process, 'platform', { ...platformDescriptor, value: 'linux' });
    const { filesToHash, filesToRemove } = classifyLocallyModifiedFiles(
      new Map<string, GitStatusKind>([
        ['staged.txt', 'indexOnly'],
        ['staged-link', 'indexOnly']
      ]),
      symlinks
    );
    expect(filesToHash).toEqual([]);
    expect(filesToRemove).toEqual([]);
  });
});
