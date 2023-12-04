// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as React from 'react';

import styles from './styles.sass';
import oldStyles from './stylesCSS.css';
import altSyntaxStyles from './stylesAltSyntax.scss';
import stylesUseSyntax from './stylesUseSyntax.sass';
import stylesUseAltSyntax from './stylesUseAltSyntax.scss';
import './stylesAltSyntax.global.scss';

/**
 * This React component renders the application page.
 */
export class ExampleApp extends React.Component {
  public render(): React.ReactNode {
    // Test 3 different style syntaxes: .sass, .css, and .scss, as well as imports.
    return (
      <div className={oldStyles.container}>
        <div className={styles.exampleApp}>
          <h2 className={styles.exampleImport}>Hello, world!</h2>
          <p className={altSyntaxStyles.label}>Here is an example styled buttons:</p>
          <button className={styles.exampleButton}>Example Button</button>
          <a className={stylesUseSyntax.exampleAnchor} href="#anchor">
            Example Anchor
          </a>
          <p className={stylesUseAltSyntax.label}>Here is an example styled unordered list and list items</p>
          <ul className={stylesUseAltSyntax.exampleList}>
            <li className={stylesUseAltSyntax.exampleListItem1}>1st</li>
            <li className={stylesUseAltSyntax.exampleListItem2}>2nd</li>
            <li className={stylesUseAltSyntax.exampleListItem3}>3rd</li>
          </ul>
        </div>
      </div>
    );
  }
}
