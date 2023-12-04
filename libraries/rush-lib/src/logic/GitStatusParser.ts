// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export interface IGitStatusEntryBase {
  kind: 'untracked' | 'changed' | 'unmerged' | 'renamed' | 'copied';
  path: string;
}

export interface IUntrackedGitStatusEntry extends IGitStatusEntryBase {
  kind: 'untracked';
}

export type GitStatusChangeType = 'added' | 'deleted' | 'modified' | 'renamed' | 'copied' | 'type-changed';

export interface IChangedGitStatusEntryFields {
  stagedChangeType: GitStatusChangeType | undefined;
  unstagedChangeType: GitStatusChangeType | undefined;
  isInSubmodule: boolean;
  headFileMode: string;
  indexFileMode: string;
  worktreeFileMode: string;
  headObjectName: string;
  indexObjectName: string;
}

export interface IChangedGitStatusEntry extends IGitStatusEntryBase, IChangedGitStatusEntryFields {
  kind: 'changed';
}

export interface IRenamedOrCopiedGitStatusEntry extends IGitStatusEntryBase, IChangedGitStatusEntryFields {
  kind: 'renamed' | 'copied';
  renameOrCopyScore: number;
  originalPath: string;
}

export interface IUnmergedGitStatusEntry extends IGitStatusEntryBase {
  kind: 'unmerged';
  stagedChangeType: GitStatusChangeType | undefined;
  unstagedChangeType: GitStatusChangeType | undefined;
  isInSubmodule: boolean;
  stage1FileMode: string;
  stage2FileMode: string;
  stage3FileMode: string;
  worktreeFileMode: string;
  stage1ObjectName: string;
  stage2ObjectName: string;
  stage3ObjectName: string;
}

export type IGitStatusEntry =
  | IUntrackedGitStatusEntry
  | IChangedGitStatusEntry
  | IRenamedOrCopiedGitStatusEntry
  | IUnmergedGitStatusEntry;

function _parseGitStatusChangeType(str: string): GitStatusChangeType | undefined {
  switch (str) {
    case 'M': {
      return 'modified';
    }

    case 'T': {
      return 'type-changed';
    }

    case 'A': {
      return 'added';
    }

    case 'D': {
      return 'deleted';
    }

    case 'R': {
      return 'renamed';
    }

    case 'C': {
      return 'copied';
    }

    case '.': {
      return undefined;
    }

    default: {
      throw new Error(`Unexpected git status change type: ${str}`);
    }
  }
}

function _parseIsInSubmodule(submoduleState: string): boolean {
  // This field is actually four characters long, but this parser only handles if the entry is in a
  // submodule or not. That is represented by a "N" or an "S" in the first character.
  const submoduleMode: string = submoduleState.charAt(0);
  if (submoduleMode === 'N') {
    return false;
  } else if (submoduleMode === 'S') {
    return true;
  } else {
    throw new Error(`Unexpected submodule state: ${submoduleState}`);
  }
}

export function* parseGitStatus(gitStatusOutput: string): Iterable<IGitStatusEntry> {
  // See reference https://git-scm.com/docs/git-status?msclkid=1cff552bcdce11ecadf77a086eded66c#_porcelain_format_version_2

  let pos: number = 0;

  function getFieldAndAdvancePos(delimiter: string): string {
    const newPos: number = gitStatusOutput.indexOf(delimiter, pos);
    if (newPos === -1) {
      throw new Error(`Unexpected end of git status output after position ${pos}`);
    }

    const field: string = gitStatusOutput.substring(pos, newPos);
    pos = newPos + delimiter.length;
    return field;
  }

  /**
   * @example
   * ```
   * ? path/g.ts
   * ```
   */
  function parseUntrackedEntry(): IUntrackedGitStatusEntry {
    const path: string = getFieldAndAdvancePos('\0');
    const entry: IUntrackedGitStatusEntry = {
      kind: 'untracked',
      path
    };
    return entry;
  }

  /**
   * @example
   * ```
   * 1 A. N... 000000 100644 100644 0000000000000000000000000000000000000000 a171a25d2c978ba071959f39dbeaa339fe84f768 path/a.ts\0
   * 1 MM N... 100644 100644 100644 d20c7e41acf4295db610f395f50a554145b4ece7 8299b2a7d657ec1211649f14c85737d68a920d9e path/b.ts\0
   * 1 .D N... 100644 100644 000000 3fcb58810c113c90c366dd81d16443425c7b95fa 3fcb58810c113c90c366dd81d16443425c7b95fa path/c.ts\0
   * 1 D. N... 100644 000000 000000 91b0203b85a7bb605e35f842d1d05d66a6275e10 0000000000000000000000000000000000000000 path/d.ts\0
   * 1 A. N... 000000 100644 100644 0000000000000000000000000000000000000000 451de43c5cb012af55a79cc3463849ab3cfa0457 path/f.ts\0
   * 1 AM N... 000000 100644 100644 0000000000000000000000000000000000000000 9d9ab4adc79c591c0aa72f7fd29a008c80893e3e path/h.ts\0
   * ```
   */
  function parseAddModifyOrDeleteEntry(): IChangedGitStatusEntry {
    // 1 MM N... 100644 100644 100644 d20c7e41acf4295db610f395f50a554145b4ece7 8299b2a7d657ec1211649f14c85737d68a920d9e path/b.ts\0
    //   ^
    const changeTypeField: string = getFieldAndAdvancePos(' ');
    const rawStagedChangeType: string = changeTypeField.charAt(0);
    const stagedChangeType: GitStatusChangeType | undefined = _parseGitStatusChangeType(rawStagedChangeType);
    const rawUnstagedChangeType: string = changeTypeField.charAt(1);
    const unstagedChangeType: GitStatusChangeType | undefined =
      _parseGitStatusChangeType(rawUnstagedChangeType);

    // 1 MM N... 100644 100644 100644 d20c7e41acf4295db610f395f50a554145b4ece7 8299b2a7d657ec1211649f14c85737d68a920d9e path/b.ts\0
    //      ^
    const submoduleState: string = getFieldAndAdvancePos(' ');
    const isInSubmodule: boolean = _parseIsInSubmodule(submoduleState);

    // 1 MM N... 100644 100644 100644 d20c7e41acf4295db610f395f50a554145b4ece7 8299b2a7d657ec1211649f14c85737d68a920d9e path/b.ts\0
    //           ^
    const headFileMode: string = getFieldAndAdvancePos(' ');
    // 1 MM N... 100644 100644 100644 d20c7e41acf4295db610f395f50a554145b4ece7 8299b2a7d657ec1211649f14c85737d68a920d9e path/b.ts\0
    //                  ^
    const indexFileMode: string = getFieldAndAdvancePos(' ');
    // 1 MM N... 100644 100644 100644 d20c7e41acf4295db610f395f50a554145b4ece7 8299b2a7d657ec1211649f14c85737d68a920d9e path/b.ts\0
    //                         ^
    const worktreeFileMode: string = getFieldAndAdvancePos(' ');

    // 1 MM N... 100644 100644 100644 d20c7e41acf4295db610f395f50a554145b4ece7 8299b2a7d657ec1211649f14c85737d68a920d9e path/b.ts\0
    //                                ^
    const headObjectName: string = getFieldAndAdvancePos(' ');
    // 1 MM N... 100644 100644 100644 d20c7e41acf4295db610f395f50a554145b4ece7 8299b2a7d657ec1211649f14c85737d68a920d9e path/b.ts\0
    //                                                                         ^
    const indexObjectName: string = getFieldAndAdvancePos(' ');

    // 1 MM N... 100644 100644 100644 d20c7e41acf4295db610f395f50a554145b4ece7 8299b2a7d657ec1211649f14c85737d68a920d9e path/b.ts\0
    //                                                                                                                  ^
    const path: string = getFieldAndAdvancePos('\0');

    const entry: IChangedGitStatusEntry = {
      kind: 'changed',
      stagedChangeType,
      unstagedChangeType,
      isInSubmodule,
      headFileMode,
      indexFileMode,
      worktreeFileMode,
      headObjectName,
      indexObjectName,
      path
    };
    return entry;
  }

  /**
   * @example
   * ```
   * 2 R. N... 100644 100644 100644 451de43c5cb012af55a79cc3463849ab3cfa0457 451de43c5cb012af55a79cc3463849ab3cfa0457 R100 path/e.ts\0e2.ts\0
   * ```
   */
  function parseRenamedOrCopiedEntry(): IRenamedOrCopiedGitStatusEntry {
    // 2 R. N... 100644 100644 100644 451de43c5cb012af55a79cc3463849ab3cfa0457 451de43c5cb012af55a79cc3463849ab3cfa0457 R100 path/e.ts\0e2.ts\0
    //   ^
    const changeTypeField: string = getFieldAndAdvancePos(' ');
    const rawStagedChangeType: string = changeTypeField.charAt(0);
    const stagedChangeType: GitStatusChangeType | undefined = _parseGitStatusChangeType(rawStagedChangeType);
    const rawUnstagedChangeType: string = changeTypeField.charAt(1);
    const unstagedChangeType: GitStatusChangeType | undefined =
      _parseGitStatusChangeType(rawUnstagedChangeType);

    // 2 R. N... 100644 100644 100644 451de43c5cb012af55a79cc3463849ab3cfa0457 451de43c5cb012af55a79cc3463849ab3cfa0457 R100 path/e.ts\0e2.ts\0
    //      ^
    const submoduleState: string = getFieldAndAdvancePos(' ');
    const isInSubmodule: boolean = _parseIsInSubmodule(submoduleState);

    // 2 R. N... 100644 100644 100644 451de43c5cb012af55a79cc3463849ab3cfa0457 451de43c5cb012af55a79cc3463849ab3cfa0457 R100 path/e.ts\0e2.ts\0
    //           ^
    const headFileMode: string = getFieldAndAdvancePos(' ');
    // 2 R. N... 100644 100644 100644 451de43c5cb012af55a79cc3463849ab3cfa0457 451de43c5cb012af55a79cc3463849ab3cfa0457 R100 path/e.ts\0e2.ts\0
    //                  ^
    const indexFileMode: string = getFieldAndAdvancePos(' ');
    // 2 R. N... 100644 100644 100644 451de43c5cb012af55a79cc3463849ab3cfa0457 451de43c5cb012af55a79cc3463849ab3cfa0457 R100 path/e.ts\0e2.ts\0
    //                         ^
    const worktreeFileMode: string = getFieldAndAdvancePos(' ');

    // 2 R. N... 100644 100644 100644 451de43c5cb012af55a79cc3463849ab3cfa0457 451de43c5cb012af55a79cc3463849ab3cfa0457 R100 path/e.ts\0e2.ts\0
    //                                ^
    const headObjectName: string = getFieldAndAdvancePos(' ');
    // 2 R. N... 100644 100644 100644 451de43c5cb012af55a79cc3463849ab3cfa0457 451de43c5cb012af55a79cc3463849ab3cfa0457 R100 path/e.ts\0e2.ts\0
    //                                                                         ^
    const indexObjectName: string = getFieldAndAdvancePos(' ');

    // 2 R. N... 100644 100644 100644 451de43c5cb012af55a79cc3463849ab3cfa0457 451de43c5cb012af55a79cc3463849ab3cfa0457 R100 path/e.ts\0e2.ts\0
    //                                                                                                                  ^
    const renameOrCopyScoreField: string = getFieldAndAdvancePos(' ');
    const renameOrCopyMode: string = renameOrCopyScoreField.charAt(0);
    const rawRenameOrCopyScore: string = renameOrCopyScoreField.substring(1);
    const renameOrCopyScore: number = parseInt(rawRenameOrCopyScore, 10);
    let kind: 'renamed' | 'copied';
    if (renameOrCopyMode === 'R') {
      kind = 'renamed';
    } else if (renameOrCopyMode === 'C') {
      kind = 'copied';
    } else {
      throw new Error(`Unexpected rename or copy mode: ${renameOrCopyMode}`);
    }

    // 2 R. N... 100644 100644 100644 451de43c5cb012af55a79cc3463849ab3cfa0457 451de43c5cb012af55a79cc3463849ab3cfa0457 R100 path/e.ts\0e2.ts\0
    //                                                                                                                       ^
    const path: string = getFieldAndAdvancePos('\0');
    // 2 R. N... 100644 100644 100644 451de43c5cb012af55a79cc3463849ab3cfa0457 451de43c5cb012af55a79cc3463849ab3cfa0457 R100 path/e.ts\0e2.ts\0
    //                                                                                                                                  ^
    const originalPath: string = getFieldAndAdvancePos('\0');

    const entry: IRenamedOrCopiedGitStatusEntry = {
      kind,
      stagedChangeType,
      unstagedChangeType,
      isInSubmodule,
      headFileMode,
      indexFileMode,
      worktreeFileMode,
      headObjectName,
      indexObjectName,
      renameOrCopyScore,
      path,
      originalPath
    };
    return entry;
  }

  /**
   * @example
   * ```
   * u .M N... 100644 100644 100644 100644 07b1571a387db3072be485e6cc5591fef35bf666 63f37aa0393e142e2c8329593eb0f78e4cc77032 ebac91ffe8227e6e9b99d9816ce0a6d166b4a524 path/unmerged.ts\0
   * ```
   */
  function parseUnmergedEntry(): IUnmergedGitStatusEntry {
    // u .M N... 100644 100644 100644 100644 07b1571a387db3072be485e6cc5591fef35bf666 63f37aa0393e142e2c8329593eb0f78e4cc77032 ebac91ffe8227e6e9b99d9816ce0a6d166b4a524 path/unmerged.ts\0
    //   ^
    const changeTypeField: string = getFieldAndAdvancePos(' ');
    const rawStagedChangeType: string = changeTypeField.charAt(0);
    const stagedChangeType: GitStatusChangeType | undefined = _parseGitStatusChangeType(rawStagedChangeType);
    const rawUnstagedChangeType: string = changeTypeField.charAt(1);
    const unstagedChangeType: GitStatusChangeType | undefined =
      _parseGitStatusChangeType(rawUnstagedChangeType);

    // u .M N... 100644 100644 100644 100644 07b1571a387db3072be485e6cc5591fef35bf666 63f37aa0393e142e2c8329593eb0f78e4cc77032 ebac91ffe8227e6e9b99d9816ce0a6d166b4a524 path/unmerged.ts\0
    //      ^
    const submoduleState: string = getFieldAndAdvancePos(' ');
    const isInSubmodule: boolean = _parseIsInSubmodule(submoduleState);

    // u .M N... 100644 100644 100644 100644 07b1571a387db3072be485e6cc5591fef35bf666 63f37aa0393e142e2c8329593eb0f78e4cc77032 ebac91ffe8227e6e9b99d9816ce0a6d166b4a524 path/unmerged.ts\0
    //           ^
    const stage1FileMode: string = getFieldAndAdvancePos(' ');
    // u .M N... 100644 100644 100644 100644 07b1571a387db3072be485e6cc5591fef35bf666 63f37aa0393e142e2c8329593eb0f78e4cc77032 ebac91ffe8227e6e9b99d9816ce0a6d166b4a524 path/unmerged.ts\0
    //                  ^
    const stage2FileMode: string = getFieldAndAdvancePos(' ');
    // u .M N... 100644 100644 100644 100644 07b1571a387db3072be485e6cc5591fef35bf666 63f37aa0393e142e2c8329593eb0f78e4cc77032 ebac91ffe8227e6e9b99d9816ce0a6d166b4a524 path/unmerged.ts\0
    //                         ^
    const stage3FileMode: string = getFieldAndAdvancePos(' ');
    // u .M N... 100644 100644 100644 100644 07b1571a387db3072be485e6cc5591fef35bf666 63f37aa0393e142e2c8329593eb0f78e4cc77032 ebac91ffe8227e6e9b99d9816ce0a6d166b4a524 path/unmerged.ts\0
    //                                ^
    const worktreeFileMode: string = getFieldAndAdvancePos(' ');

    // u .M N... 100644 100644 100644 100644 07b1571a387db3072be485e6cc5591fef35bf666 63f37aa0393e142e2c8329593eb0f78e4cc77032 ebac91ffe8227e6e9b99d9816ce0a6d166b4a524 path/unmerged.ts\0
    //                                       ^
    const stage1ObjectName: string = getFieldAndAdvancePos(' ');
    // u .M N... 100644 100644 100644 100644 07b1571a387db3072be485e6cc5591fef35bf666 63f37aa0393e142e2c8329593eb0f78e4cc77032 ebac91ffe8227e6e9b99d9816ce0a6d166b4a524 path/unmerged.ts\0
    //                                                                                ^
    const stage2ObjectName: string = getFieldAndAdvancePos(' ');
    // u .M N... 100644 100644 100644 100644 07b1571a387db3072be485e6cc5591fef35bf666 63f37aa0393e142e2c8329593eb0f78e4cc77032 ebac91ffe8227e6e9b99d9816ce0a6d166b4a524 path/unmerged.ts\0
    //                                                                                                                         ^
    const stage3ObjectName: string = getFieldAndAdvancePos(' ');

    // u .M N... 100644 100644 100644 100644 07b1571a387db3072be485e6cc5591fef35bf666 63f37aa0393e142e2c8329593eb0f78e4cc77032 ebac91ffe8227e6e9b99d9816ce0a6d166b4a524 path/unmerged.ts\0
    //                                                                                                                                                                  ^
    const path: string = getFieldAndAdvancePos('\0');

    const entry: IUnmergedGitStatusEntry = {
      kind: 'unmerged',
      stagedChangeType,
      unstagedChangeType,
      isInSubmodule,
      stage1FileMode,
      stage2FileMode,
      stage3FileMode,
      worktreeFileMode,
      stage1ObjectName,
      stage2ObjectName,
      stage3ObjectName,
      path
    };
    return entry;
  }

  while (pos < gitStatusOutput.length) {
    const modeField: string = getFieldAndAdvancePos(' ');
    switch (modeField) {
      case '?': {
        // Untracked
        yield parseUntrackedEntry();
        break;
      }

      case '1': {
        // Simple change
        yield parseAddModifyOrDeleteEntry();
        break;
      }

      case '2': {
        // Renamed or copied
        yield parseRenamedOrCopiedEntry();
        break;
      }

      case 'u': {
        // Unmerged
        yield parseUnmergedEntry();
        break;
      }

      default: {
        throw new Error(`Unexpected git status mode: ${modeField}`);
      }
    }
  }
}
