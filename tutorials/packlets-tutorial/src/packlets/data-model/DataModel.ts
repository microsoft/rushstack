// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Logger } from '../../packlets/logging';

export interface IDataRecord {
  firstName: string;
  lastName: string;
  age: number;
}

export abstract class DataModel {
  protected readonly logger: Logger;

  public constructor(logger: Logger) {
    this.logger = logger;
  }
  public abstract queryRecords(): IDataRecord[];
}
