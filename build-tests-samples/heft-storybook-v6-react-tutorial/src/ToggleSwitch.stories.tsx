// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as React from 'react';
import type { ComponentStory, ComponentMeta } from 'heft-storybook-v6-react-tutorial-storykit';

import { ToggleSwitch } from './ToggleSwitch.tsx';

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
