// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as terser from 'terser';
import { DEFAULT_DIGIT_SORT } from '../Constants';

// This file monkey-patches Terser to disable character frequency analysis

interface IBase54 {
  consider: (token: string, weight: number) => void;
  reset(): void;
  sort(): void;
}

// @ts-ignore Monkey-patch
const base54: IBase54 = terser.base54;
const coreReset: () => void = base54.reset;
base54.reset = (): void => {
    coreReset();
    for (let i: number = 0, len: number = DEFAULT_DIGIT_SORT.length; i < len; i++) {
        base54.consider(DEFAULT_DIGIT_SORT[i], len - i);
    }
    base54.sort();
};

// @ts-ignore Monkey-patch
terser.AST_Toplevel.prototype.compute_char_frequency = (): void => { // eslint-disable-line @typescript-eslint/camelcase
    base54.reset();
};