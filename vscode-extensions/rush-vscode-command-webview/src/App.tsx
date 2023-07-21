import { Stack, IStackStyles, IStackTokens, initializeIcons } from '@fluentui/react';
import * as React from 'react';
import { useEffect } from 'react';
import { fromExtensionListener } from './Message/fromExtension';
import { ParameterView } from './ParameterView';
import { Toolbar } from './Toolbar';
import { useAppSelector } from './store/hooks';

initializeIcons();

// Styles definition
const stackStyles: IStackStyles = {
  root: {
    height: '100vh',
    padding: 0
  }
};

const verticalGapStackTokens: IStackTokens = {
  childrenGap: 10,
  padding: 10
};

export const App = (): JSX.Element => {
  const selectedProject: string = useAppSelector((state) => state.project.projectName);

  useEffect(() => {
    console.log('initializing app in effect');
    window.addEventListener('message', fromExtensionListener);
    return () => {
      window.removeEventListener('message', fromExtensionListener);
    };
  }, []);

  console.log('initializing app');

  return (
    <Stack styles={stackStyles} tokens={verticalGapStackTokens}>
      <Stack.Item style={{ zIndex: 1 }}>
        <Toolbar />
      </Stack.Item>
      <Stack.Item grow style={{ overflow: 'auto', marginTop: 0 }}>
        {/* <ParameterView /> */}
        <h4>Selected project {selectedProject}</h4>
      </Stack.Item>
    </Stack>
  );
};
