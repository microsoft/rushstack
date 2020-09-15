import * as React from 'react';

/**
 * Slider positions for `ToggleSwitch`.
 */
export const enum ToggleSwitchPosition {
  Left = 'left',
  Right = 'right'
}

/**
 * Event arguments for `IToggleSwitchProps.onToggle`.
 */
export interface IToggleEventArgs {
  sliderPosition: ToggleSwitchPosition;
}

export interface IToggleSwitchProps {
  /**
   * The CSS color when the `ToggleSwitch` slider is in the left position.
   * Example value: `"#800000"`
   */
  leftColor: string;

  /**
   * The CSS color when the `ToggleSwitch` slider is in the right position.
   * Example value: `"#008000"`
   */
  rightColor: string;

  /**
   * An event that fires when the `ToggleSwitch` control is clicked.
   */
  onToggle?: (sender: ToggleSwitch, args: IToggleEventArgs) => void;
}

/**
 * Private state for ToggleSwitch.
 */
interface IToggleSwitchState {
  sliderPosition: ToggleSwitchPosition;
}

/**
 * An example component that renders a switch whose slider position can be "left" or "right".
 */
export class ToggleSwitch extends React.Component<IToggleSwitchProps, IToggleSwitchState> {
  public constructor(props: IToggleSwitchProps) {
    super(props);
    this.state = {
      sliderPosition: ToggleSwitchPosition.Left
    };
  }

  public render(): React.ReactNode {
    const frameStyle: React.CSSProperties = {
      borderRadius: '10px',
      backgroundColor:
        this.state.sliderPosition === ToggleSwitchPosition.Left
          ? this.props.leftColor
          : this.props.rightColor,
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

    if (this.state.sliderPosition === ToggleSwitchPosition.Left) {
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

  // React event handlers should be represented as fields instead of methods to ensure the "this" pointer
  // is bound correctly.  This form does not work with virtual/override inheritance, so use regular methods
  // everywhere else.
  private _onClickSlider = (event: React.MouseEvent): void => {
    if (this.state.sliderPosition === ToggleSwitchPosition.Left) {
      this.setState({ sliderPosition: ToggleSwitchPosition.Right });
    } else {
      this.setState({ sliderPosition: ToggleSwitchPosition.Left });
    }

    if (this.props.onToggle) {
      this.props.onToggle(this, { sliderPosition: this.state.sliderPosition });
    }
  };
}
