// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { serial, IExecutable } from '@microsoft/gulp-core-build';
import { MochaTask } from './MochaTask';
import { InstrumentTask } from './InstrumentTask';

/** @public */
export const instrument: InstrumentTask = new InstrumentTask();
/** @public */
export const mocha: MochaTask = new MochaTask();

export default serial(instrument, mocha) as IExecutable; // tslint:disable-line:export-name no-any
