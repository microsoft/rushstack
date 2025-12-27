// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
// import { ThemeProvider, PartialTheme } from '@fluentui/react';
import { FluentProvider, teamsDarkTheme } from '@fluentui/react-components';

import { App } from './App';
import { store } from './store';

// const theme: PartialTheme = {
//   palette: {
//     // themePrimary: 'var(--vscode-settings-headerForeground)',
//     // themeSecondary: 'var(--vscode-button-secondaryForeground)',
//     neutralDark: 'var(--vscode-settings-headerForeground)'
//   },
//   defaultFontStyle: {
//     fontFamily: 'var(--vscode-font-family)',
//     fontWeight: 'var(--vscode-font-weight)',
//     fontSize: 'var(--vscode-font-size)'
//   },
//   semanticColors: {
//     focusBorder: 'var(--vscode-focusBorder)',
//     errorText: 'var(--vscode-errorForeground)',
//     buttonText: 'var(--vscode-button-foreground)',
//     buttonBackground: 'var(--vscode-button-background)',
//     buttonBackgroundHovered: 'var(--vscode-button-hoverBackground)',
//     primaryButtonText: 'var(--vscode-button-foreground)',
//     primaryButtonBackground: 'var(--vscode-button-background)',
//     primaryButtonBackgroundHovered: 'var(--vscode-button-hoverBackground)',
//     inputIcon: 'var(--vscode-settings-textInputForeground)',
//     inputIconHovered: 'var(--vscode-settings-textInputForeground)',
//     inputText: 'var(--vscode-settings-textInputForeground)',
//     inputBackground: 'var(--vscode-settings-textInputBackground)',
//     inputPlaceholderText: 'var(--vscode-input-placeholderForeground)',
//     inputBorderHovered: 'var(--vscode-inputOption-activeForeground)',
//     inputFocusBorderAlt: 'var(--vscode-inputOption-activeBorder)',
//     inputBackgroundChecked: 'var(--vscode-inputOption-activeBackground)',
//     inputBackgroundCheckedHovered: 'var(--vscode-inputOption-activeBackground)',
//     inputForegroundChecked: 'var(--vscode-inputOption-activeForeground)',
//     bodyText: 'var(--vscode-editor-foreground)',
//     bodyBackground: 'var(--vscode-editor-background)'
//   }
// };

// eslint-disable-next-line @rushstack/no-new-null
const $root: HTMLElement | null = document.getElementById('root');

if ($root) {
  ReactDOM.createRoot($root).render(
    <FluentProvider theme={teamsDarkTheme}>
      <Provider store={store}>
        <App />
      </Provider>
    </FluentProvider>
  );
} else {
  // eslint-disable-next-line no-console
  console.error("error can't find root!");
}
