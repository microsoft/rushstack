// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export interface IDataRecord {
  firstName: string;
  lastName: string;
  age: number;
}

export abstract class DataModel {
  public abstract queryRecords(): IDataRecord[];
}
