// eslint-disable-next-line @typescript-eslint/no-unused-vars
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { MyClass } from './MyClass';

const rootDiv: HTMLElement = document.getElementById('root') as HTMLElement;

const myClass: MyClass = new MyClass();

ReactDOM.render(<div>{myClass.doSomething()}</div>, rootDiv);
