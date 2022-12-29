import React from 'react';
import * as RadixScrollArea from '@radix-ui/react-scroll-area';
import styles from './styles.scss';

export const ScrollArea = ({ children }: { children: any }) => (
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
