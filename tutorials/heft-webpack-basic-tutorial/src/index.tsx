// eslint-disable-next-line @typescript-eslint/no-unused-vars
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { ExampleApp } from './ExampleApp';

import './index.css';

const rootDiv: HTMLElement = document.getElementById('root') as HTMLElement;
ReactDOM.render(<ExampleApp />, rootDiv);
