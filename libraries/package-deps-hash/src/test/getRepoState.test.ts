// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { parseGitStatus, parseGitVersion } from '../getRepoState.ts';

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
    const files: string[] = [`A.ts`, `B.ts`, `C.ts`];
    const input: string = [`A  ${files[0]}`, `D  ${files[1]}`, `M  ${files[2]}`, ''].join('\0');

    const result: Map<string, boolean> = parseGitStatus(input);

    expect(result.size).toEqual(3);
    expect(result.get(files[0])).toEqual(true);
    expect(result.get(files[1])).toEqual(false);
    expect(result.get(files[2])).toEqual(true);
  });

  it('Finds working tree entries', () => {
    const files: string[] = [`A.ts`, `B.ts`, `C.ts`];
    const input: string = [` A ${files[0]}`, ` D ${files[1]}`, ` M ${files[2]}`, ''].join('\0');

    const result: Map<string, boolean> = parseGitStatus(input);

    expect(result.size).toEqual(3);
    expect(result.get(files[0])).toEqual(true);
    expect(result.get(files[1])).toEqual(false);
    expect(result.get(files[2])).toEqual(true);
  });

  it('Can handle untracked files', () => {
    const files: string[] = [`A.ts`, `B.ts`, `C.ts`];
    const input: string = [`?? ${files[0]}`, `?? ${files[1]}`, `?? ${files[2]}`, ''].join('\0');

    const result: Map<string, boolean> = parseGitStatus(input);

    expect(result.size).toEqual(3);
    expect(result.get(files[0])).toEqual(true);
    expect(result.get(files[1])).toEqual(true);
    expect(result.get(files[2])).toEqual(true);
  });

  it('Can handle files modified in both index and working tree', () => {
    const files: string[] = [`A.ts`, `B.ts`, `C.ts`];
    const input: string = [`D  ${files[0]}`, `AD ${files[1]}`, `DA ${files[2]}`, ''].join('\0');

    const result: Map<string, boolean> = parseGitStatus(input);

    expect(result.size).toEqual(3);
    expect(result.get(files[0])).toEqual(false);
    expect(result.get(files[1])).toEqual(false);
    expect(result.get(files[2])).toEqual(true);
  });
});
