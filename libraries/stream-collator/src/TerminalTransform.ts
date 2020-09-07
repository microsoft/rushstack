// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { TerminalWritable } from './TerminalWritable';

/** @beta */
export interface ITerminalTransformOptions {
  destination: TerminalWritable;
}

/** @beta */
export abstract class TerminalTransform extends TerminalWritable {
  public readonly destination: TerminalWritable;

  public constructor(options: ITerminalTransformOptions) {
    super();
    this.destination = options.destination;
  }

  protected onClose(): void {
    this.destination.close();
  }
}
