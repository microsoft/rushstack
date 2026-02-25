// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as React from 'react';
import { createRoot } from 'react-dom/client';

import { ExampleApp } from './ExampleApp.tsx';

import './index.css';

const rootDiv: HTMLElement = document.getElementById('root') as HTMLElement;
createRoot(rootDiv).render(<ExampleApp />);
