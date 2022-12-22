import React from 'react';
import * as RadixTabs from '@radix-ui/react-tabs';
import styles from './styles.scss';

type TabsItem = {
  header: string;
  body?: any;
};

export const Tabs = ({
  items,
  def,
  value,
  onChange,
  children
}: {
  items: TabsItem[];
  def?: string;
  value?: string;
  onChange?: (value: string) => void;
  children?: any;
}) => (
  <RadixTabs.Root
    className={styles.TabsRoot}
    defaultValue={def || items[0].header}
    value={value}
    onValueChange={onChange}
  >
    <RadixTabs.List className={styles.TabsList} aria-label="Manage your account">
      {items.map((item) => (
        <RadixTabs.Trigger className={styles.TabsTrigger} value={item.header}>
          {item.header}
        </RadixTabs.Trigger>
      ))}
    </RadixTabs.List>
    {children
      ? children
      : items.map((item) => (
          <RadixTabs.Content className={styles.TabsContent} value={item.header}>
            {item.body}
          </RadixTabs.Content>
        ))}
  </RadixTabs.Root>
);
