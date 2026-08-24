// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem } from '@rushstack/node-core-library';

export interface IWorkspaceFileSaveOptions {
  /**
   * If there is an existing file, and the contents have not changed, then
   * don't write anything; this preserves the old timestamp.
   */
  onlyIfChanged?: boolean;

  /**
   * Creates the folder recursively using FileSystem.ensureFolder()
   * Defaults to false.
   */
  ensureFolderExists?: boolean;
}

/**
 * This class is a parser for pnpm's pnpm-workspace.yaml file format.
 */
export abstract class BaseWorkspaceFile {
  protected _alreadyWarnedSpecs: Set<string> = new Set<string>();

  /**
   * Serializes and saves the workspace file to specified location
   */
  public async saveAsync(filePath: string, options: IWorkspaceFileSaveOptions): Promise<void> {
    const { onlyIfChanged, ensureFolderExists } = options;

    // Do we need to read the previous file contents?
    let oldBuffer: Buffer | undefined;
    if (onlyIfChanged) {
      try {
        oldBuffer = await FileSystem.readFileToBufferAsync(filePath);
      } catch (error) {
        // Ignore this error, and try writing a new file.  If that fails, then we should report that
        // error instead.
      }
    }

    const newContent: string = await this.serializeAsync();
    const newBuffer: Buffer = Buffer.from(newContent); // utf8 encoding happens here

    if (oldBuffer) {
      // Has the file changed?
      if (Buffer.compare(newBuffer, oldBuffer) === 0) {
        // Nothing has changed, so don't touch the file
        return;
      }
    }

    await FileSystem.writeFileAsync(filePath, newBuffer.toString(), {
      ensureFolderExists
    });
  }

  /**
   * Adds a package path to the workspace file.
   *
   * @virtual
   */
  public abstract addPackage(packagePath: string): void;

  /** @virtual */
  protected abstract serializeAsync(): Promise<string>;
}
