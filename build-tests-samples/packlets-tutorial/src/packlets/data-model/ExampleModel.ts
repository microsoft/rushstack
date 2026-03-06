// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { DataModel, IDataRecord } from './DataModel.ts';

export class ExampleModel extends DataModel {
  public queryRecords(): IDataRecord[] {
    return [
      {
        firstName: 'Alice',
        lastName: 'Exampleton',
        age: 27
      },
      {
        firstName: 'Bob',
        lastName: 'Examplemeyer',
        age: 31
      }
    ];
  }
}
