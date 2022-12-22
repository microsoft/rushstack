import React from 'react';
import * as RadixTabs from '@radix-ui/react-tabs';
import styles from './styles.scss';

type TabsItem = {
  header: string;
  body: any;
};

export const Tabs = ({ items, def }: { items: TabsItem[]; def?: string }) => (
  <RadixTabs.Root className={styles.TabsRoot} defaultValue={def || items[0].header}>
    <RadixTabs.List className={styles.TabsList} aria-label="Manage your account">
      {items.map((item) => (
        <RadixTabs.Trigger className={styles.TabsTrigger} value={item.header}>
          {item.header}
        </RadixTabs.Trigger>
      ))}
    </RadixTabs.List>
    {items.map((item) => (
      <RadixTabs.Content className={styles.TabsContent} value={item.header}>
        {item.body};
      </RadixTabs.Content>
    ))}
  </RadixTabs.Root>
);
