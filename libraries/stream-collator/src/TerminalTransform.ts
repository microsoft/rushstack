// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { TerminalWriter } from './TerminalWriter';

/** @beta */
export interface ITerminalTransformOptions {
  destination: TerminalWriter;
}

/** @beta */
export abstract class TerminalTransform extends TerminalWriter {
  public readonly destination: TerminalWriter;

  public constructor(options: ITerminalTransformOptions) {
    super();
    this.destination = options.destination;
  }

  protected onClose(): void {
    this.destination.close();
  }
}
