// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { type SliceCaseReducers, createSlice, type Slice, type PayloadAction } from '@reduxjs/toolkit';
import type { FieldValues } from 'react-hook-form';

import type { CommandLineParameterKind } from '@rushstack/ts-command-line';

import { useAppSelector } from '../hooks/index.ts';

export interface ICommandLineParameter {
  readonly kind: CommandLineParameterKind;
  readonly longName: string;
  readonly shortName: string | undefined;
  readonly description: string;
  readonly required: boolean;
}

export interface IParameterState {
  commandName: string;
  parameters: ICommandLineParameter[];
  argsKV: Record<string, number | string | boolean | undefined | string[] | number[]>;
  searchText: string;
}

const initialState: IParameterState = {
  commandName: '',
  parameters: [],
  argsKV: {},
  searchText: ''
};

export const parameterSlice: Slice<IParameterState, SliceCaseReducers<IParameterState>, string> = createSlice(
  {
    name: 'parameter',
    initialState,
    reducers: {
      initializeParameters: (state, action: PayloadAction<IParameterState>) => {
        Object.assign(state, action.payload);
      },
      onChangeFormDefaultValues: (state, action: PayloadAction<FieldValues>) => {
        // clear argsKV first
        state.argsKV = {};
        patchStateByFormValues(state, action.payload);
      },
      onChangeFormValues: (state, action: PayloadAction<FieldValues>) => {
        patchStateByFormValues(state, action.payload);
      },
      onChangeSearchText: (state, action: PayloadAction<string>) => {
        state.searchText = action.payload;
      }
    }
  }
);

function patchStateByFormValues(state: IParameterState, fieldValues: FieldValues): void {
  for (const [key, fieldValue] of Object.entries(fieldValues)) {
    if (typeof fieldValue === 'string') {
      switch (fieldValue) {
        case '': {
          state.argsKV[key] = undefined;
          break;
        }
        case 'true': {
          state.argsKV[key] = true;
          break;
        }
        case 'false': {
          state.argsKV[key] = false;
          break;
        }
        default: {
          state.argsKV[key] = fieldValue;
          break;
        }
      }
    } else if (Array.isArray(fieldValue)) {
      const filteredValue: string[] = fieldValue
        .map(({ value }: { value: string | number }) => String(value))
        .filter(Boolean);
      if (filteredValue.length) {
        state.argsKV[key] = filteredValue;
      } else {
        state.argsKV[key] = [];
      }
    } else {
      state.argsKV[key] = fieldValue;
    }
  }
}

export const { initializeParameters, onChangeFormDefaultValues, onChangeFormValues, onChangeSearchText } =
  parameterSlice.actions;

export const useParameterArgs: () => string[] = () =>
  useAppSelector((state) => {
    const args: string[] = [];
    for (const [k, v] of Object.entries(state.parameter.argsKV)) {
      if (v) {
        if (v === true) {
          args.push(k);
        } else if (Array.isArray(v)) {
          v.forEach((item: string | number) => {
            args.push(k);
            args.push(String(item));
          });
        } else {
          args.push(k);
          args.push(String(v));
        }
      }
    }
    return args;
  });

function isParametersEqual(left: ICommandLineParameter[], right: ICommandLineParameter[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let i: number = 0; i < left.length; i++) {
    const item: ICommandLineParameter = left[i];
    Object.entries(item).forEach(([key, value]) => {
      if (value !== right[i][key as keyof ICommandLineParameter]) {
        return false;
      }
    });
  }
  return true;
}

export const useParameters: () => ICommandLineParameter[] = () => {
  return useAppSelector((state) => {
    return state.parameter.parameters;
  }, isParametersEqual);
};

export const useFilteredParameters: () => ICommandLineParameter[] = () => {
  const parameters: ICommandLineParameter[] = useParameters();
  const searchText: string = useAppSelector((state) => state.parameter.searchText);
  return parameters.filter((parameter) => {
    return parameter.longName.includes(searchText) || parameter.description.includes(searchText);
  });
};

export const useArgsTextList = (): string[] => {
  const args: string[] = useParameterArgs();
  const argsTextList: string[] = [];
  for (let i: number = 0; i < args.length; i++) {
    const currentArg: string = args[i];
    let nextArg: string | undefined;
    if (i + 1 < args.length) {
      nextArg = args[i + 1];
    }
    if (!nextArg || nextArg?.startsWith('--')) {
      argsTextList.push(currentArg);
    } else {
      argsTextList.push(`${currentArg} ${nextArg}`);
      i++;
    }
  }
  return argsTextList;
};

export default parameterSlice.reducer;
