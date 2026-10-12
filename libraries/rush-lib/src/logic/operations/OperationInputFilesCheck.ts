// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { Executable, Path } from '@rushstack/node-core-library';

import { EnvironmentConfiguration } from '../../api/EnvironmentConfiguration';
import type { IInputsSnapshot } from '../incremental/InputsSnapshot';
import type { IOperationExecutionResult } from './IOperationExecutionResult';
import {
  haveInputFilesChanged,
  haveSnapshotHashesChangedAsync,
  hasUntrackedGitFiles,
  type IInputFilesState
} from './InputFilesStatSignature';

/**
 * Returns a function that returns the path of the Git executable, if it is found. The path is resolved when the
 * function is first called.
 */
export function createGitPathGetter(): () => string | undefined {
  let gitPath: string | undefined;
  let isGitPathResolved: boolean = false;
  return (): string | undefined => {
    if (!isGitPathResolved) {
      gitPath = EnvironmentConfiguration.gitBinaryPath || Executable.tryResolve('git');
      isGitPathResolved = true;
    }
    return gitPath;
  };
}

/**
 * Returns the start of the window in which an operation's input files may have changed after the inputs snapshot
 * read them: when the snapshot began reading the working tree, or, if that is not known, the current time. Call it
 * when the iteration begins, before any of its operations execute.
 */
export function getSnapshotStartTimeMs(inputsSnapshot: IInputsSnapshot): number {
  return inputsSnapshot.workingTreeReadStartTimeMs ?? Date.now();
}

/**
 * Returns the absolute paths of the folders that an operation's command writes in its project: its metadata folder and
 * its output folders.
 */
function getOutputFolderPaths(record: IOperationExecutionResult): string[] {
  const { operation, metadataFolderPath } = record;
  const { projectFolder } = operation.associatedProject;
  return [metadataFolderPath, ...(operation.settings?.outputFolderNames ?? [])].map((folderName: string) =>
    path.resolve(projectFolder, folderName)
  );
}

export interface IInputFilesChangeCheckOptions {
  readonly inputFilesState: IInputFilesState;
  readonly snapshotHashes: ReadonlyMap<string, string> | undefined;
  readonly getGitPath: () => string | undefined;
  readonly isNewInput: (newEntryPaths: ReadonlyArray<string>) => boolean;
}

export type InputFilesChangeKind = 'none' | 'snapshot-hashes' | 'file-state';

/**
 * Returns how an operation's input files changed after the inputs snapshot read them, if they changed.
 */
export async function getInputFilesChangeKindSinceSnapshotAsync({
  inputFilesState,
  snapshotHashes,
  getGitPath,
  isNewInput
}: IInputFilesChangeCheckOptions): Promise<InputFilesChangeKind> {
  const { rootDirectory, filesChangedDuringSnapshot } = inputFilesState;
  if (
    filesChangedDuringSnapshot.length > 0 &&
    (await haveSnapshotHashesChangedAsync(
      getGitPath(),
      rootDirectory,
      filesChangedDuringSnapshot,
      snapshotHashes
    ))
  ) {
    return 'snapshot-hashes';
  }
  return haveInputFilesChanged(inputFilesState, isNewInput) ? 'file-state' : 'none';
}

/**
 * Returns true if an operation's input files changed after the inputs snapshot read them.
 */
export async function haveInputFilesChangedSinceSnapshotAsync(
  options: IInputFilesChangeCheckOptions
): Promise<boolean> {
  return (await getInputFilesChangeKindSinceSnapshotAsync(options)) !== 'none';
}

/**
 * Returns true if an operation's input files changed after the inputs snapshot read them: a file was deleted before
 * their state was captured, or, since then, a file was modified, deleted or replaced, or a potential input file was
 * created in a folder that holds its input files, or a file was saved after Git hashed it.
 */
export async function haveOperationInputFilesChangedAsync(
  record: IOperationExecutionResult,
  inputsSnapshot: IInputsSnapshot,
  inputFilesState: IInputFilesState,
  getGitPath: () => string | undefined
): Promise<boolean> {
  const { rootDirectory } = inputFilesState;
  const outputFolderPaths: string[] = getOutputFolderPaths(record);
  const isNewInput = (newEntryPaths: ReadonlyArray<string>): boolean => {
    // E.g. the output folder that the first run of the operation created
    const candidatePaths: string[] = newEntryPaths.filter(
      (entryPath: string) =>
        !outputFolderPaths.some((folderPath: string) => Path.isUnderOrEqual(entryPath, folderPath))
    );
    if (candidatePaths.length === 0) {
      return false;
    }
    const gitPath: string | undefined = getGitPath();
    // Without Git it cannot be told whether the new entries are ignored, so they count as inputs.
    return (
      !gitPath ||
      hasUntrackedGitFiles(gitPath, rootDirectory, candidatePaths, outputFolderPaths, inputsSnapshot.hashes)
    );
  };
  const { associatedProject: project, associatedPhase: phase } = record.operation;
  return await haveInputFilesChangedSinceSnapshotAsync({
    inputFilesState,
    snapshotHashes: inputsSnapshot.getTrackedFileHashesForOperation(project, phase.name),
    getGitPath,
    isNewInput
  });
}
