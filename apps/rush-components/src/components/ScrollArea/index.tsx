import React from 'react';
import * as RadixScrollArea from '@radix-ui/react-scroll-area';
import styles from './styles.scss';

const TAGS = Array.from({ length: 50 }).map((_, i, a) => `v1.2.0-beta.${a.length - i}`);

export const ScrollArea = () => (
  <RadixScrollArea.Root className={styles.ScrollAreaRoot}>
    <RadixScrollArea.Viewport className={styles.ScrollAreaViewport}>
      <div style={{ padding: '15px 20px' }}>
        <div className={styles.Text}>Tags</div>
        {TAGS.map((tag) => (
          <div className={styles.Tag} key={tag}>
            {tag}
          </div>
        ))}
      </div>
    </RadixScrollArea.Viewport>
    <RadixScrollArea.Scrollbar className={styles.ScrollAreaScrollbar} orientation="vertical">
      <RadixScrollArea.Thumb className={styles.ScrollAreaThumb} />
    </RadixScrollArea.Scrollbar>
    <RadixScrollArea.Scrollbar className={styles.ScrollAreaScrollbar} orientation="horizontal">
      <RadixScrollArea.Thumb className={styles.ScrollAreaThumb} />
    </RadixScrollArea.Scrollbar>
    <RadixScrollArea.Corner className={styles.ScrollAreaCorner} />
  </RadixScrollArea.Root>
);
