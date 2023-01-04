// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import React, { useCallback } from 'react';
import appStyles from '../../App.scss';
import styles from './styles.scss';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { LockfileEntry } from '../../parsing/LockfileEntry';
import { clearStackAndPush, removeBookmark } from '../../store/slices/entrySlice';
import { Button } from '@rushstack/components';

export const BookmarksSidebar = (): JSX.Element => {
  const bookmarks = useAppSelector((state) => state.entry.bookmarkedEntries);
  const dispatch = useAppDispatch();

  const clear = useCallback(
    (entry: LockfileEntry) => () => {
      dispatch(clearStackAndPush(entry));
    },
    []
  );
  const deleteEntry = useCallback(
    (entry: LockfileEntry) => () => {
      dispatch(removeBookmark(entry));
    },
    []
  );

  return (
    <div className={`${appStyles.ContainerCard} ${styles.BookmarksWrapper}`}>
      <h5>Bookmarks</h5>
      <hr />
      {bookmarks.map((bookmarkedEntry) => (
        <div key={bookmarkedEntry.rawEntryId} className={styles.BookmarkEntry}>
          <p onClick={clear(bookmarkedEntry)}>{bookmarkedEntry.displayText}</p>
          <Button onClick={deleteEntry(bookmarkedEntry)}>Remove</Button>
        </div>
      ))}
    </div>
  );
};
