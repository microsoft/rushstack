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
  public save(filePath: string, options: IWorkspaceFileSaveOptions): void {
    // Do we need to read the previous file contents?
    let oldBuffer: Buffer | undefined = undefined;
    if (options.onlyIfChanged && FileSystem.exists(filePath)) {
      try {
        oldBuffer = FileSystem.readFileToBuffer(filePath);
      } catch (error) {
        // Ignore this error, and try writing a new file.  If that fails, then we should report that
        // error instead.
      }
    }

    const newYaml: string = this.serialize();

    const newBuffer: Buffer = Buffer.from(newYaml); // utf8 encoding happens here

    if (options.onlyIfChanged) {
      // Has the file changed?
      if (oldBuffer && Buffer.compare(newBuffer, oldBuffer) === 0) {
        // Nothing has changed, so don't touch the file
        return;
      }
    }

    FileSystem.writeFile(filePath, newBuffer.toString(), {
      ensureFolderExists: options.ensureFolderExists
    });
  }

  /**
   * Adds a package path to the workspace file.
   *
   * @virtual
   */
  public abstract addPackage(packagePath: string): void;

  /** @virtual */
  protected abstract serialize(): string;
}
