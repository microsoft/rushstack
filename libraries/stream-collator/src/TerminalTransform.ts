// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { TerminalWritable, ITerminalWritableOptions } from './TerminalWritable';

/** @beta */
export interface ITerminalTransformOptions extends ITerminalWritableOptions {
  destination: TerminalWritable;
  preventDestinationAutoclose?: boolean;
}

/** @beta */
export abstract class TerminalTransform extends TerminalWritable {
  public readonly destination: TerminalWritable;
  public readonly preventDestinationAutoclose: boolean;

  public constructor(options: ITerminalTransformOptions) {
    super();
    this.destination = options.destination;
    this.preventDestinationAutoclose = !!options.preventDestinationAutoclose;
  }

  protected onClose(): void {
    this.autocloseDestination();
  }

  protected autocloseDestination(): void {
    if (!this.preventDestinationAutoclose && !this.destination.preventAutoclose) {
      this.destination.close();
    }
  }
}
