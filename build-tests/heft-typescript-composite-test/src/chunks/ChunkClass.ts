// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export class ChunkClass {
  public doStuff(): void {
    // eslint-disable-next-line no-console
    console.log('CHUNK');
  }

  public getImageUrl(): string {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('./image.png');
  }
}
