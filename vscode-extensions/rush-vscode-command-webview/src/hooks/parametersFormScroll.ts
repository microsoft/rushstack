// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { type MutableRefObject, type UIEventHandler, useCallback, useEffect, useRef } from 'react';
import type { Dispatch, AnyAction } from '@reduxjs/toolkit';

import { useAppDispatch } from '../store/hooks/index.ts';
import {
  setCurretParameterName,
  setIsToolbarSticky,
  setUserSelectedParameterName,
  useCurrentParameterName,
  useIsToolbarSticky,
  useUserSelectedParameterName
} from '../store/slices/ui.ts';

export const SCROLLABLE_ELEMENT_ID: string = 'parameters-scrollable-element';
export const FIELD_ANCHOR_CLASSNAME: string = 'parameters-field-anchor';

export interface IUseScrollableElementReturn {
  elementId: string;
  onScroll: UIEventHandler<HTMLElement>;
}

export interface IUseStickyToolbarReturn {
  isSticky: boolean;
}

export const useStickyToolbar = (): IUseStickyToolbarReturn => {
  const isSticky: boolean = useIsToolbarSticky();
  return {
    isSticky
  };
};

export const useScrollableElement = (): IUseScrollableElementReturn => {
  const isSticky: boolean = useIsToolbarSticky();
  const currentParameterName: string = useCurrentParameterName();
  const userSelectedParameterName: string = useUserSelectedParameterName();
  const dispatch: Dispatch<AnyAction> = useAppDispatch();
  const timeoutIdRef: MutableRefObject<ReturnType<typeof setTimeout> | undefined> = useRef(undefined);
  const userSelectionScrollingRef: MutableRefObject<boolean> = useRef(false);

  const deboucedScrollEnd: () => void = useCallback(() => {
    if (timeoutIdRef.current) {
      clearTimeout(timeoutIdRef.current);
    }
    timeoutIdRef.current = setTimeout(() => {
      userSelectionScrollingRef.current = false;
      timeoutIdRef.current = undefined;
    }, 100);
  }, []);

  useEffect(() => {
    if (userSelectedParameterName) {
      userSelectionScrollingRef.current = true;
    }
  }, [userSelectedParameterName]);

  const onScroll: UIEventHandler<HTMLElement> = useCallback(() => {
    const $el: HTMLElement | null = document.getElementById(SCROLLABLE_ELEMENT_ID);
    if (!$el) {
      return;
    }
    const newIsStick: boolean = $el.scrollTop !== 0;
    if (isSticky !== newIsStick) {
      dispatch(setIsToolbarSticky(newIsStick));
    }

    /**
     * Do not detect parameter name if still scrolling after
     * user selected a parameter name.
     */
    if (!userSelectionScrollingRef.current) {
      const $parameters: HTMLElement[] = Array.from(document.querySelectorAll(`.${FIELD_ANCHOR_CLASSNAME}`));
      const estimateParameterHeight: number = 90;
      const $currentParameter: HTMLElement | undefined =
        $parameters.find(($p) => {
          return $p.offsetTop - $el.offsetTop - $el.scrollTop + estimateParameterHeight > 0;
        }) || $parameters[0];
      const nextParameterName: string = $currentParameter?.id || '';
      if (nextParameterName !== currentParameterName) {
        dispatch(setCurretParameterName(nextParameterName));
        dispatch(setUserSelectedParameterName(''));
      }
    }
    deboucedScrollEnd();
  }, [isSticky, currentParameterName, deboucedScrollEnd]);

  return {
    elementId: SCROLLABLE_ELEMENT_ID,
    onScroll
  };
};
