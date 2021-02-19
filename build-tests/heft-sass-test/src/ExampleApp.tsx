// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as React from 'react';

import styles from './styles.sass';
import oldStyles from './stylesCSS.css';
import altSyntaxStyles from './stylesAltSyntax.scss';

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
          <p className={altSyntaxStyles.label}>Here is an example styled button:</p>
          <button className={styles.exampleButton}>Example Button</button>
        </div>
      </div>
    );
  }
}
