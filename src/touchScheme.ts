import { TOUCH_SCHEME_BUTTON_DAS_DEFAULT } from './constants';

export type TouchScheme = 'buttons' | 'gestures';

/** Resolve active mobile scheme (URL wins over default). */
export function resolveTouchScheme(): TouchScheme {
  const params = new URLSearchParams(window.location.search);
  const raw = (params.get('controls') || '').toLowerCase();
  if (raw === 'gestures' || raw === 'finger' || raw === 'seek') return 'gestures';
  if (raw === 'buttons' || raw === 'das' || raw === 'pad') return 'buttons';
  return TOUCH_SCHEME_BUTTON_DAS_DEFAULT ? 'buttons' : 'gestures';
}

export function isButtonDasScheme(): boolean {
  return resolveTouchScheme() === 'buttons';
}
