import React from 'react';
import * as RadixTabs from '@radix-ui/react-tabs';
import styles from './styles.scss';

type TabsItem = {
  header: string;
  value?: string | number;
  body?: any;
};

export const Tabs = ({
  items,
  def,
  value,
  onChange,
  renderChildren
}: {
  items: TabsItem[];
  def?: string;
  value?: string | number;
  onChange?: (value: any) => void;
  renderChildren?: () => JSX.Element;
}) => {
  const getItemValue = (item: TabsItem) => (item.value === undefined ? item.header : item.value);
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
