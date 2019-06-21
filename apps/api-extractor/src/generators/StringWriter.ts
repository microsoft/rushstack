// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { StringBuilder } from '@microsoft/tsdoc';

// A small helper used by the generators
export class StringWriter {
  public readonly stringBuilder: StringBuilder = new StringBuilder();

  public write(s: string): void {
    this.stringBuilder.append(s);
  }

  public writeLine(s: string = ''): void {
    if (s.length > 0) {
      this.stringBuilder.append(s);
    }
    this.stringBuilder.append('\n');
  }

  public toString(): string {
    return this.stringBuilder.toString();
  }
}
