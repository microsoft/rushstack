// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  parseGitStatus,
  parseGitVersion,
  _parseGitSubmoduleStatus,
  _parseGitSubmoduleForEachGitLsTree
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

describe(_parseGitSubmoduleStatus.name, () => {
  it('Can parse valid git submodule status responses', () => {
    expect(
      _parseGitSubmoduleStatus(` 964eb484a347b0aac4e68995139080fb0d4bc1c4 submodule1 (heads/main)
 964eb484a347b0aac4e68995139080fb0d4bc1c4 submodule2 (heads/main)`)
    ).toEqual(['submodule1', 'submodule2']);
  });
});

describe(_parseGitSubmoduleForEachGitLsTree.name, () => {
  it('Can parse valid git submodule foreach ls-tree responses', () => {
    expect(
      _parseGitSubmoduleForEachGitLsTree(`Entering 'submodule1'
100644 blob 9f818da416c78e02c82dbd1899fe21ca2975e77d${'\t'}.gitignore
100644 blob 0cb89e60375d44cb4f8cefc2be036042f5aaf95f${'\t'}env/config/rush-project.json
100644 blob 0a26f06602cd2dab7d7220ae6724f964630efd10${'\t'}env/package.json
100644 blob 46decf4a1c9b2f8d94150fcdfcd13df46c1ff12f${'\t'}env/src/index.ts
100644 blob da13b3825764a87531ab94a94260a2dbcc2bb8c0${'\t'}env/tsconfig.json
进入 'submodule2'
100644 blob 9f818da416c78e02c82dbd1899fe21ca2975e77d${'\t'}.gitignore
100644 blob 0cb89e60375d44cb4f8cefc2be036042f5aaf95f${'\t'}env/config/rush-project.json
100644 blob 0a26f06602cd2dab7d7220ae6724f964630efd10${'\t'}env/package.json
100644 blob 46decf4a1c9b2f8d94150fcdfcd13df46c1ff12f${'\t'}env/src/index.ts
100644 blob da13b3825764a87531ab94a94260a2dbcc2bb8c0${'\t'}env/tsconfig.json`)
    ).toEqual({
      submodule1: {
        '.gitignore': '9f818da416c78e02c82dbd1899fe21ca2975e77d',
        'env/config/rush-project.json': '0cb89e60375d44cb4f8cefc2be036042f5aaf95f',
        'env/package.json': '0a26f06602cd2dab7d7220ae6724f964630efd10',
        'env/src/index.ts': '46decf4a1c9b2f8d94150fcdfcd13df46c1ff12f',
        'env/tsconfig.json': 'da13b3825764a87531ab94a94260a2dbcc2bb8c0'
      },
      submodule2: {
        '.gitignore': '9f818da416c78e02c82dbd1899fe21ca2975e77d',
        'env/config/rush-project.json': '0cb89e60375d44cb4f8cefc2be036042f5aaf95f',
        'env/package.json': '0a26f06602cd2dab7d7220ae6724f964630efd10',
        'env/src/index.ts': '46decf4a1c9b2f8d94150fcdfcd13df46c1ff12f',
        'env/tsconfig.json': 'da13b3825764a87531ab94a94260a2dbcc2bb8c0'
      }
    });
  });
});
