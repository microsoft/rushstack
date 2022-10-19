import React from 'react';
import appStyles from '../../appstyles.scss';
import styles from './styles.scss';

export const BookmarksSidebar = (): JSX.Element => {
  return (
    <div className={`${appStyles.containerCard} ${styles.BookmarksWrapper}`}>
      <h5>Bookmarks</h5>
    </div>
  );
};
