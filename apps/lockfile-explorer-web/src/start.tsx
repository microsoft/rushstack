// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';

import { App } from './App';
import './start.css';
import { store } from './store';

const rootDiv: HTMLElement = document.getElementById('root') as HTMLElement;
ReactDOM.createRoot(rootDiv).render(
  <Provider store={store}>
    <App />
  </Provider>
);
