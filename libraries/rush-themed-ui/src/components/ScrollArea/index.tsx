// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import React from 'react';
import * as RadixScrollArea from '@radix-ui/react-scroll-area';

import styles from './styles.scss';

/**
 * React props for {@link ScrollArea}
 * @public
 */
export interface IScrollAreaProps {
  children: React.ReactNode;
}

/**
 * A UI component for managing a scrollable area.
 * @remarks
 *
 * The height of the scroll area's parent must be fixed.
 * @public
 */
export const ScrollArea = ({ children }: IScrollAreaProps): React.ReactElement => (
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
