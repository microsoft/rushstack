// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import React, { useCallback } from 'react';
import appStyles from '../../App.scss';
import styles from './styles.scss';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import type { LockfileEntry } from '../../packlets/lfx-shared';
import { clearStackAndPush, removeBookmark } from '../../store/slices/entrySlice';
import { Button, ScrollArea, Text } from '@rushstack/rush-themed-ui';

export const BookmarksSidebar = (): JSX.Element => {
  const bookmarks = useAppSelector((state) => state.entry.bookmarkedEntries);
  const dispatch = useAppDispatch();

  const clear = useCallback(
    (entry: LockfileEntry) => () => {
      dispatch(clearStackAndPush(entry));
    },
    [dispatch]
  );
  const deleteEntry = useCallback(
    (entry: LockfileEntry) => () => {
      dispatch(removeBookmark(entry));
    },
    [dispatch]
  );

  return (
    <div className={`${appStyles.ContainerCard} ${styles.BookmarksWrapper}`}>
      <ScrollArea>
        <Text type="h5">Bookmarks</Text>
        <hr />
        {bookmarks.map((bookmarkedEntry) => (
          <div key={bookmarkedEntry.rawEntryId} className={styles.BookmarkEntry}>
            <div onClick={clear(bookmarkedEntry)} className={styles.BookmarkLabel}>
              <Text type="p">{bookmarkedEntry.displayText}</Text>
            </div>
            <Button onClick={deleteEntry(bookmarkedEntry)}>Remove</Button>
          </div>
        ))}
      </ScrollArea>
    </div>
  );
};
