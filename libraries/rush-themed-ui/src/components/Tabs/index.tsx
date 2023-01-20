// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import React from 'react';
import * as RadixTabs from '@radix-ui/react-tabs';
import styles from './styles.scss';

export interface ITabsItem {
  header: string;
  value?: string | number;
  body?: React.ReactNode;
}

export interface ITabsProps {
  items: ITabsItem[];
  def?: string;
  value?: string | number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onChange?: (value: any) => void;
  renderChildren?: () => JSX.Element;
}

export const Tabs = ({ items, def, value, onChange, renderChildren }: ITabsProps): JSX.Element => {
  const getItemValue = (item: ITabsItem): string | number =>
    item.value === undefined ? item.header : item.value;
  return (
    <RadixTabs.Root
      className={styles.TabsRoot}
      defaultValue={def || items[0].header}
      value={value}
      onValueChange={onChange}
    >
      <RadixTabs.List className={styles.TabsList} aria-label="Manage your account">
        {items.map((item) => (
          <RadixTabs.Trigger key={item.header} className={styles.TabsTrigger} value={getItemValue(item)}>
            {item.header}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {renderChildren
        ? renderChildren()
        : items.map((item) =>
            item.body ? (
              <RadixTabs.Content className={styles.TabsContent} value={getItemValue(item)}>
                {item.body}
              </RadixTabs.Content>
            ) : null
          )}
    </RadixTabs.Root>
  );
};
