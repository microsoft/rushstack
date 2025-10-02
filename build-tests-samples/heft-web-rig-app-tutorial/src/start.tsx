// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as React from 'react';
import * as ReactDOM from 'react-dom';

import { ExampleApp } from './ExampleApp';

import './start.css';

const rootDiv: HTMLElement = document.getElementById('root') as HTMLElement;
ReactDOM.render(<ExampleApp />, rootDiv);
