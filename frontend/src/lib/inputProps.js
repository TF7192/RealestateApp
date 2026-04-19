// Input-prop helpers — guarantees the right iOS keyboard pops up and
// browser autofill / autocorrect / autocapitalize behave correctly.
// Spread into <input {...inputPropsForPhone()} />.
//
// Why type="text" + inputMode for numeric fields (not type="number"):
//   - type="number" on iOS tries to render a stepper UI with a slimmer
//     "0-9 . -" keypad and fights with our comma-formatting / RTL.
//   - type="text" + inputMode="numeric" pops the same numeric pad on
//     iOS but lets us format ("2,500,000") and avoids the spinner.
//   - pattern triggers the iPad numeric keyboard fallback too.

export function inputPropsForPrice() {
  return {
    type: 'text',
    inputMode: 'numeric',
    pattern: '[0-9]*',
    autoComplete: 'off',
    autoCorrect: 'off',
    spellCheck: false,
    enterKeyHint: 'next',
    dir: 'ltr',
    style: { textAlign: 'right' },
  };
}

export function inputPropsForRooms() {
  return {
    type: 'text',
    inputMode: 'decimal',
    pattern: '[0-9.]*',
    autoComplete: 'off',
    autoCorrect: 'off',
    spellCheck: false,
    enterKeyHint: 'next',
    dir: 'ltr',
    style: { textAlign: 'right' },
  };
}

export function inputPropsForSqm() {
  return {
    type: 'text',
    inputMode: 'numeric',
    pattern: '[0-9]*',
    autoComplete: 'off',
    autoCorrect: 'off',
    spellCheck: false,
    enterKeyHint: 'next',
    dir: 'ltr',
    style: { textAlign: 'right' },
  };
}

export function inputPropsForFloor() {
  return {
    type: 'text',
    inputMode: 'numeric',
    pattern: '-?[0-9]*',
    autoComplete: 'off',
    autoCorrect: 'off',
    spellCheck: false,
    enterKeyHint: 'next',
    dir: 'ltr',
    style: { textAlign: 'right' },
  };
}

export function inputPropsForPhone() {
  return {
    type: 'tel',
    inputMode: 'tel',
    autoComplete: 'tel',
    autoCorrect: 'off',
    spellCheck: false,
    enterKeyHint: 'next',
    dir: 'ltr',
    style: { textAlign: 'right' },
  };
}

export function inputPropsForEmail() {
  return {
    type: 'email',
    inputMode: 'email',
    autoComplete: 'email',
    autoCorrect: 'off',
    autoCapitalize: 'off',
    spellCheck: false,
    enterKeyHint: 'next',
    dir: 'ltr',
    style: { textAlign: 'right' },
  };
}

export function inputPropsForName() {
  return {
    type: 'text',
    autoComplete: 'name',
    autoCapitalize: 'words',
    autoCorrect: 'off',
    spellCheck: false,
    enterKeyHint: 'next',
  };
}

export function inputPropsForAddress() {
  return {
    type: 'text',
    autoComplete: 'street-address',
    autoCapitalize: 'words',
    autoCorrect: 'off',
    spellCheck: false,
    enterKeyHint: 'next',
  };
}

export function inputPropsForCity() {
  return {
    type: 'text',
    autoComplete: 'address-level2',
    autoCapitalize: 'words',
    autoCorrect: 'off',
    spellCheck: false,
    enterKeyHint: 'next',
  };
}

// Generic search field — popups search keyboard with a "Search" return key.
export function inputPropsForSearch() {
  return {
    type: 'search',
    inputMode: 'search',
    autoComplete: 'off',
    autoCorrect: 'off',
    autoCapitalize: 'off',
    spellCheck: false,
    enterKeyHint: 'search',
  };
}

// URLs (e.g. agency-page paste field): LTR, no caps, "Go" return key.
export function inputPropsForUrl() {
  return {
    type: 'url',
    inputMode: 'url',
    autoComplete: 'off',
    autoCorrect: 'off',
    autoCapitalize: 'off',
    spellCheck: false,
    enterKeyHint: 'go',
    dir: 'ltr',
  };
}

// Free-form Hebrew notes — `dir="auto"` lets the browser pick LTR for
// numbers/URLs but RTL for Hebrew, which is exactly what we want for
// mixed-content notes fields. enterKeyHint="enter" so the keyboard
// shows the line-break key, not "Submit".
export function inputPropsForNotes() {
  return {
    dir: 'auto',
    autoCapitalize: 'sentences',
    enterKeyHint: 'enter',
  };
}
