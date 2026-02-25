// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  type IStackItemStyles,
  type IStackStyles,
  type IStackTokens,
  type IStyle,
  Stack
} from '@fluentui/react';
import * as React from 'react';
import type { CSSProperties } from 'react';

import { useStickyToolbar } from '../hooks/parametersFormScroll.ts';
import { RunButton } from './RunButton.tsx';
import { SearchBar } from './SearchBar.tsx';

// Styles definition
const stackStyles: IStackStyles = {
  root: {
    // background: DefaultPalette.themeTertiary,
    transition: 'box-shadow ease-in-out 0.1s'
  }
};

const stackItemStyles: IStackItemStyles = {
  root: {
    // background: DefaultPalette.themePrimary,
    // color: DefaultPalette.white,
  }
};

const horizontalGapStackTokens: IStackTokens = {
  childrenGap: 10,
  padding: 10
};

export const Toolbar = (): React.ReactElement => {
  const { isSticky } = useStickyToolbar();
  if (isSticky) {
    stackStyles.root = {
      ...(stackStyles.root as CSSProperties),
      boxShadow: 'rgb(17 17 26 / 10%) 0px 4px 16px, rgb(17 17 26 / 5%) 0px 8px 32px'
    } as IStyle;
  } else {
    (stackStyles.root as CSSProperties).boxShadow = 'none';
  }
  return (
    <Stack horizontal disableShrink styles={stackStyles} tokens={horizontalGapStackTokens}>
      <Stack.Item align="center" grow styles={stackItemStyles}>
        <SearchBar />
      </Stack.Item>
      <Stack.Item align="center" styles={stackItemStyles}>
        <RunButton />
      </Stack.Item>
    </Stack>
  );
};
