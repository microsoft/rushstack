// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as React from 'react';
import { IconButton as FIconButton, type IButtonProps } from '@fluentui/react';

const iconButtonStyles: IButtonProps['styles'] = {
  root: {
    color: 'var(--vscode-input-foreground)'
  },
  rootHovered: {
    color: 'var(--vscode-input-foreground)',
    background: 'var(--vscode-inputOption-hoverBackground)'
  },
  rootPressed: {
    color: 'var(--vscode-button-secondaryForeground)',
    backgroundColor: 'var(--vscode-button--secondaryBackground)'
  }
};

export const IconButton = (props: IButtonProps): React.ReactElement => {
  return <FIconButton {...props} styles={iconButtonStyles} />;
};
