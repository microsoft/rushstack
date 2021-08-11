import * as React from 'react';
import { ComponentStory, ComponentMeta } from '@storybook/react';

import { ToggleSwitch } from './ToggleSwitch';

export default {
  title: 'Octogonz/ToggleSwitch',
  component: ToggleSwitch,
  argTypes: {
    leftColor: { control: 'color' },
    rightColor: { control: 'color' }
  }
} as ComponentMeta<typeof ToggleSwitch>;

const Template: ComponentStory<typeof ToggleSwitch> = (args) => <ToggleSwitch {...args} />;

// eslint-disable-next-line
export const Primary: any = Template.bind({});
Primary.args = {};

// eslint-disable-next-line
export const Secondary: any = Template.bind({});
Secondary.args = {};
