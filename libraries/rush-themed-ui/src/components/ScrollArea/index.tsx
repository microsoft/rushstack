// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import React from 'react';
import * as RadixScrollArea from '@radix-ui/react-scroll-area';
import styles from './styles.scss';

export interface IScrollAreaProps {
  children: React.ReactNode;
}

// Note: the height of the scroll area's parent must be fixed
export const ScrollArea = ({ children }: IScrollAreaProps): JSX.Element => (
  <RadixScrollArea.Root className={styles.ScrollAreaRoot}>
    <RadixScrollArea.Viewport className={styles.ScrollAreaViewport}>{children}</RadixScrollArea.Viewport>
    <RadixScrollArea.Scrollbar className={styles.ScrollAreaScrollbar} orientation="vertical">
      <RadixScrollArea.Thumb className={styles.ScrollAreaThumb} />
    </RadixScrollArea.Scrollbar>
    <RadixScrollArea.Scrollbar className={styles.ScrollAreaScrollbar} orientation="horizontal">
      <RadixScrollArea.Thumb className={styles.ScrollAreaThumb} />
    </RadixScrollArea.Scrollbar>
    <RadixScrollArea.Corner className={styles.ScrollAreaCorner} />
  </RadixScrollArea.Root>
);
