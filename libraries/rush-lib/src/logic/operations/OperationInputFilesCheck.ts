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

/**
 * Returns true if an operation's input files changed since their state was captured: a file was modified, deleted or
 * replaced, a potential input file was created in a folder that holds its input files, or a file was saved while the
 * inputs snapshot was being taken, after Git hashed it.
 */
export async function haveOperationInputFilesChangedAsync(
  record: IOperationExecutionResult,
  inputsSnapshot: IInputsSnapshot,
  inputFilesState: IInputFilesState,
  getGitPath: () => string | undefined
): Promise<boolean> {
  const { rootDirectory, filesChangedDuringSnapshot } = inputFilesState;
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
    return !gitPath || hasUntrackedGitFiles(gitPath, rootDirectory, candidatePaths, outputFolderPaths);
  };
  if (haveInputFilesChanged(inputFilesState, isNewInput)) {
    return true;
  }
  if (filesChangedDuringSnapshot.length === 0) {
    return false;
  }
  const { associatedProject: project, associatedPhase: phase } = record.operation;
  return await haveSnapshotHashesChangedAsync(
    getGitPath(),
    rootDirectory,
    filesChangedDuringSnapshot,
    inputsSnapshot.getTrackedFileHashesForOperation(project, phase.name)
  );
}
