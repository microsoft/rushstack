// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import React, { useCallback } from 'react';

import { Button, ScrollArea, Text } from '@rushstack/rush-themed-ui';

import styles from './styles.scss';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  addBookmark,
  forwardStack,
  popStack,
  removeBookmark,
  selectCurrentEntry
} from '../../store/slices/entrySlice';

export const SelectedEntryPreview = (): React.ReactElement => {
  const selectedEntry = useAppSelector(selectCurrentEntry);
  const isBookmarked = useAppSelector((state) =>
    selectedEntry ? state.entry.bookmarkedEntries.includes(selectedEntry) : false
  );

  const entryStack = useAppSelector((state) => state.entry.selectedEntryStack);
  const entryForwardStack = useAppSelector((state) => state.entry.selectedEntryForwardStack);
  const dispatch = useAppDispatch();

  const bookmark = useCallback(() => {
    if (selectedEntry) dispatch(addBookmark(selectedEntry));
  }, [dispatch, selectedEntry]);
  const deleteEntry = useCallback(() => {
    if (selectedEntry) dispatch(removeBookmark(selectedEntry));
  }, [dispatch, selectedEntry]);

  const pop = useCallback(() => {
    dispatch(popStack());
  }, [dispatch]);
  const forward = useCallback(() => {
    dispatch(forwardStack());
  }, [dispatch]);

  const renderButtonRow = (): React.ReactElement => {
    return (
      <div className={styles.NavigationButtonRow}>
        <Button disabled={entryStack.length <= 1} onClick={pop}>
          Back
        </Button>
        <Button disabled={entryForwardStack.length === 0} onClick={forward}>
          Forward
        </Button>
        {isBookmarked ? (
          <Button onClick={deleteEntry} disabled={!selectedEntry}>
            Remove&nbsp;Bookmark
          </Button>
        ) : (
          <Button onClick={bookmark} disabled={!selectedEntry}>
            Add&nbsp;Bookmark
          </Button>
        )}
      </div>
    );
  };

  if (!selectedEntry) {
    return (
      <div className={styles.SelectedEntryCard}>
        <div className={styles.SelectedEntryBookmarkRow}>
          <Text type="h5" bold>
            No Entry Selected
          </Text>
          {renderButtonRow()}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.SelectedEntryCard}>
      <ScrollArea>
        <div className={styles.SelectedEntryBookmarkRow}>
          <div className={styles.SelectedEntryHeader}>
            <Text type="h5" bold>
              Selected entry:
            </Text>
            <span>{selectedEntry.displayText}</span>
          </div>
          {renderButtonRow()}
        </div>
        <div>
          <Text type="p">Package Entry: {selectedEntry.rawEntryId}</Text>
          <Text type="p">Package JSON path: {selectedEntry.packageJsonFolderPath}</Text>
        </div>
      </ScrollArea>
    </div>
  );
};
