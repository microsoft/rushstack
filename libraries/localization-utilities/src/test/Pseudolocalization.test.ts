// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { getPseudolocalizer } from '../Pseudolocalization.ts';
import type { IPseudolocaleOptions } from '../interfaces.ts';

describe(getPseudolocalizer.name, () => {
  it('gets distinct pseudolocalizers', () => {
    const input: 'text' = 'text';

    const fooOptions: IPseudolocaleOptions = {
      prepend: '-Foo-',
      append: '-Foo-'
    };
    const fooLocale: (str: string) => string = getPseudolocalizer(fooOptions);
    const foo1: string = fooLocale(input);

    const barOptions: IPseudolocaleOptions = {
      prepend: '-Bar-',
      append: '-Bar-'
    };

    const barLocale: (str: string) => string = getPseudolocalizer(barOptions);

    const bar1: string = barLocale(input);
    const foo2: string = fooLocale(input);
    const bar2: string = barLocale(input);

    expect(foo1).toEqual(foo2);
    expect(bar1).toEqual(bar2);

    expect(foo1).toMatchSnapshot('foo');
    expect(bar1).toMatchSnapshot('bar');
  });
});
