import * as React from 'react';

export interface IToggleEventArgs {
  sliderPosition: ToggleSwitchPosition;
}

export interface IToggleSwitchProps {
  leftColor: string;
  rightColor: string;
  onToggle: (sender: ToggleSwitch, args: IToggleEventArgs) => void;
}

export const enum ToggleSwitchPosition {
  Left = 'left',
  Right = 'right'
}

export class ToggleSwitch extends React.Component<IToggleSwitchProps> {
  private _sliderPosition: ToggleSwitchPosition.Left | ToggleSwitchPosition.Right;

  public constructor(props: IToggleSwitchProps) {
    super(props);
    this._sliderPosition = ToggleSwitchPosition.Left;
  }

  public render(): React.ReactNode {
    const frameStyle: React.CSSProperties = {
      borderRadius: '10px',
      backgroundColor:
        this._sliderPosition === ToggleSwitchPosition.Left ? this.props.leftColor : this.props.rightColor,
      width: '35px',
      height: '20px',
      cursor: 'pointer'
    };
    const sliderStyle: React.CSSProperties = {
      borderRadius: '10px',
      backgroundColor: '#c0c0c0',
      width: '20px',
      height: '20px'
    };

    if (this._sliderPosition === ToggleSwitchPosition.Left) {
      sliderStyle.marginLeft = '0px';
      sliderStyle.marginRight = 'auto';
    } else {
      sliderStyle.marginLeft = 'auto';
      sliderStyle.marginRight = '0px';
    }

    return (
      <div style={frameStyle} onClick={this._onClickSlider}>
        <div style={sliderStyle} />
      </div>
    );
  }

  private _onClickSlider = (event: React.MouseEvent): void => {
    if (this._sliderPosition === ToggleSwitchPosition.Left) {
      this._sliderPosition = ToggleSwitchPosition.Right;
    } else {
      this._sliderPosition = ToggleSwitchPosition.Left;
    }
    // We could also use setState() to track "sliderPosition", but the TypeScript typings don't work as well.
    this.forceUpdate();
    if (this.props.onToggle) {
      this.props.onToggle(this, { sliderPosition: this._sliderPosition });
    }
  };
}
