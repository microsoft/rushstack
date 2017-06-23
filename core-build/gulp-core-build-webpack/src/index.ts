// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { WebpackTask } from './WebpackTask';

export { IWebpackTaskConfig, WebpackTask } from './WebpackTask'

/* tslint:disable:export-name */
/** @public */
export const webpack: WebpackTask = new WebpackTask();
export default webpack;
/* tslint:enable:export-name */
