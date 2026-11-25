// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  TarExecutable as SharedTarExecutable,
  type ICreateArchiveOptions as ISharedCreateArchiveOptions,
  type IUntarOptions
} from '@rushstack/package-extractor';
import type { ITerminal } from '@rushstack/terminal';

import type { RushConfigurationProject } from '../api/RushConfigurationProject';
import { EnvironmentConfiguration } from '../api/EnvironmentConfiguration';

export type { IUntarOptions };

export interface ICreateArchiveOptions extends Omit<ISharedCreateArchiveOptions, 'baseFolderPath'> {
  project: RushConfigurationProject;
  /** The folder that paths are relative to. Defaults to the project folder. */
  baseFolderPath?: string;
}

export class TarExecutable {
  readonly #tarExecutable: SharedTarExecutable;

  private constructor(tarExecutable: SharedTarExecutable) {
    this.#tarExecutable = tarExecutable;
  }

  public static async tryInitializeAsync(terminal: ITerminal): Promise<TarExecutable | undefined> {
    const tarExecutable: SharedTarExecutable | undefined = await SharedTarExecutable.tryInitializeAsync(
      terminal,
      EnvironmentConfiguration.tarBinaryPath
    );
    return tarExecutable ? new TarExecutable(tarExecutable) : undefined;
  }

  public async tryUntarAsync(options: IUntarOptions): Promise<number> {
    return await this.#tarExecutable.tryUntarAsync(options);
  }

  public async tryCreateArchiveFromProjectPathsAsync(options: ICreateArchiveOptions): Promise<number> {
    const { project, baseFolderPath, ...rest } = options;
    return await this.#tarExecutable.tryCreateArchiveAsync({
      ...rest,
      baseFolderPath: baseFolderPath ?? project.projectFolder
    });
  }
}
