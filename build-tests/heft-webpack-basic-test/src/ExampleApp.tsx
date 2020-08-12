import * as React from 'react';
import { ToggleSwitch, IToggleEventArgs } from './ToggleSwitch';

export class ExampleApp extends React.Component {
  public render(): React.ReactNode {
    const appStyle: React.CSSProperties = {
      backgroundColor: '#ffffff',
      padding: '20px',
      borderRadius: '5px',
      width: '400px'
    };

    return (
      <div style={{ padding: '20px' }}>
        <div style={appStyle}>
          <h2>Hello, world!</h2>
          Here is an example control:
          <ToggleSwitch leftColor={'#800000'} rightColor={'#008000'} onToggle={this._onToggle} />
        </div>
      </div>
    );
  }

  private _onToggle = (sender: ToggleSwitch, args: IToggleEventArgs): void => {
    console.log('Toggle switch changed: ' + args.sliderPosition);
  };
}
