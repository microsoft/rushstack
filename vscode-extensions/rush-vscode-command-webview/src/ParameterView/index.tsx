// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as React from 'react';
import { type IStackStyles, type IStackItemStyles, type IStackTokens, Stack } from '@fluentui/react';

import { useScrollableElement } from '../hooks/parametersFormScroll';
import { ParameterForm } from './ParameterForm';
import { ParameterNav } from './ParameterNav';

// Styles definition
const stackStyles: IStackStyles = {
  root: {
    // background: DefaultPalette.themeTertiary,
    height: '100%'
  }
};
const stackItemStyles: IStackItemStyles = {
  root: {
    alignItems: 'flex-start',
    // background: DefaultPalette.themePrimary,
    // color: DefaultPalette.white,
    display: 'flex',
    height: '100%',
    justifyContent: 'flex-start',
    minWidth: 0,
    overflow: 'auto'
  }
};

// Tokens definition
const stackTokens: IStackTokens = {
  childrenGap: 5,
  padding: 10
};

export const ParameterView = (): JSX.Element => {
  const { elementId, onScroll } = useScrollableElement();
  return (
    <Stack horizontal disableShrink styles={stackStyles} tokens={stackTokens}>
      <Stack.Item align="auto" styles={stackItemStyles}>
        <ParameterNav />
      </Stack.Item>
      <Stack.Item id={elementId} align="auto" grow={1} styles={stackItemStyles} onScroll={onScroll}>
        <ParameterForm />
      </Stack.Item>
    </Stack>
  );
};
