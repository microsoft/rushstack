import { DataModel, ExampleModel } from '../packlets/data-model';
// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Logger, MessageType } from '../packlets/logging';
import { MainReport } from '../packlets/reports';

export class App {
  public run(): void {
    const logger: Logger = new Logger();
    logger.log(MessageType.Info, 'Starting app...');

    const dataModel: DataModel = new ExampleModel(logger);
    const report: MainReport = new MainReport(logger);
    report.showReport(dataModel);

    logger.log(MessageType.Info, 'Operation completed successfully');
  }
}
