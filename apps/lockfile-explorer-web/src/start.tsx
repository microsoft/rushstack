// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as React from 'react';
import * as ReactDOM from 'react-dom';

import { App } from './App';

import './start.css';
import { store } from './store';

import { Provider } from 'react-redux';

const rootDiv: HTMLElement = document.getElementById('root') as HTMLElement;
ReactDOM.render(
  <Provider store={store}>
    <App />
  </Provider>,
  rootDiv
);
