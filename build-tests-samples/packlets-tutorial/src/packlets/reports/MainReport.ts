// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { DataModel } from '../data-model';
import { Logger, MessageType } from '../logging';

export class MainReport {
  readonly #logger: Logger;

  public constructor(logger: Logger) {
    this.#logger = logger;
    this.#logger.log(MessageType.Info, 'Constructing MainReport');
  }

  public showReport(dataModel: DataModel): void {
    console.log('\n---------------------------------------');
    console.log('REPORT');
    console.log('---------------------------------------');
    for (const record of dataModel.queryRecords()) {
      console.log(`${record.firstName} ${record.lastName}: Age=${record.age}`);
    }
    console.log('---------------------------------------\n');
  }
}
