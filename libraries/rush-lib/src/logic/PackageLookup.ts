// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { BasePackage } from './base/BasePackage';

export class PackageLookup {
  #packageMap: Map<string, BasePackage>;

  public constructor() {
    this.#packageMap = new Map<string, BasePackage>();
  }

  public loadTree(root: BasePackage): void {
    const queue: BasePackage[] = [root];

    // We want the lookup to return the shallowest match, so this is a breadth first
    // traversal

    for (;;) {
      const current: BasePackage | undefined = queue.shift();
      if (!current) {
        break;
      }

      for (const child of current.children) {
        queue.push(child);
      }

      const key: string = current.nameAndVersion;

      if (!this.#packageMap.has(key)) {
        this.#packageMap.set(key, current);
      }
    }
  }

  public getPackage(nameAndVersion: string): BasePackage | undefined {
    return this.#packageMap.get(nameAndVersion);
  }
}
