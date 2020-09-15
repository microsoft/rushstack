import * as React from 'react';
import { ToggleSwitch, IToggleEventArgs } from './ToggleSwitch';

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
          <span className={altSyntaxStyles.label}>Here is an example control:</span>
          <ToggleSwitch leftColor={'#800000'} rightColor={'#008000'} onToggle={this._onToggle} />
        </div>
      </div>
    );
  }

  // React event handlers should be represented as fields instead of methods to ensure the "this" pointer
  // is bound correctly.  This form does not work with virtual/override inheritance, so use regular methods
  // everywhere else.
  private _onToggle = (sender: ToggleSwitch, args: IToggleEventArgs): void => {
    console.log('Toggle switch changed: ' + args.sliderPosition);
  };
}
