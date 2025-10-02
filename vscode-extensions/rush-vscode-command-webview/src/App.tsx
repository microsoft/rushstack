// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { /*IStackStyles, IStackTokens, */ initializeIcons } from '@fluentui/react';
import * as React from 'react';
import { useEffect } from 'react';
import {
  type SelectTabData,
  type SelectTabEvent,
  Tab,
  TabList,
  type TabValue
} from '@fluentui/react-components';

import { fromExtensionListener } from './Message/fromExtension';
// import { ParameterView } from './ParameterView';
// import { Toolbar } from './Toolbar';
// import { useAppSelector } from './store/hooks';
import { ProjectView } from './ProjectView';
import { VersionsView } from './VersionsView';

initializeIcons();

// // Styles definition
// const stackStyles: IStackStyles = {
//   root: {
//     height: '100vh',
//     padding: 0
//   }
// };

// const verticalGapStackTokens: IStackTokens = {
//   childrenGap: 10,
//   padding: 10
// };

enum Views {
  PROJECT_VIEW,
  VERSIONS_VIEW
}

export const App = (): JSX.Element => {
  const [selectedValue, setSelectedValue] = React.useState<TabValue>(Views.PROJECT_VIEW);

  const onTabSelect = (event: SelectTabEvent, data: SelectTabData): void => {
    setSelectedValue(data.value);
  };

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log('initializing app in effect');
    window.addEventListener('message', fromExtensionListener);
    return () => {
      window.removeEventListener('message', fromExtensionListener);
    };
  }, []);

  // eslint-disable-next-line no-console
  console.log('initializing app');

  return (
    // <Stack styles={stackStyles} tokens={verticalGapStackTokens}>
    //   <Stack.Item style={{ zIndex: 1 }}>
    //     <Toolbar />
    //   </Stack.Item>
    //   <Stack.Item grow style={{ overflow: 'auto', marginTop: 0 }}>
    //     <ProjectView />
    //   </Stack.Item>
    // </Stack>
    <div>
      <TabList selectedValue={selectedValue} onTabSelect={onTabSelect}>
        <Tab value={Views.PROJECT_VIEW}>Project Details</Tab>
        <Tab value={Views.VERSIONS_VIEW}>Versions</Tab>
      </TabList>
      {selectedValue === Views.PROJECT_VIEW && <ProjectView />}
      {selectedValue === Views.VERSIONS_VIEW && <VersionsView />}
    </div>
  );
};
