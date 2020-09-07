// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { TerminalWriter } from './TerminalWriter';

/** @beta */
export abstract class TerminalTransform extends TerminalWriter {
  public readonly destination: TerminalWriter;

  public constructor(destination: TerminalWriter) {
    super();
    this.destination = destination;
  }

  protected onClose(): void {
    this.destination.close();
  }
}
