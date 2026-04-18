// Input props helpers — ensures iOS opens the right keyboard and form
// autofill works. Spread into <input {...inputPropsForPhone()} />.

export function inputPropsForPrice() {
  return {
    type: 'number',
    inputMode: 'numeric',
    pattern: '[0-9]*',
    autoComplete: 'off',
    dir: 'ltr',
    style: { textAlign: 'right' },
  };
}

export function inputPropsForRooms() {
  return {
    type: 'number',
    inputMode: 'decimal',
    step: 0.5,
    min: 0,
    autoComplete: 'off',
    dir: 'ltr',
    style: { textAlign: 'right' },
  };
}

export function inputPropsForSqm() {
  return {
    type: 'number',
    inputMode: 'numeric',
    min: 0,
    autoComplete: 'off',
    dir: 'ltr',
    style: { textAlign: 'right' },
  };
}

export function inputPropsForPhone() {
  return {
    type: 'tel',
    inputMode: 'tel',
    autoComplete: 'tel',
    dir: 'ltr',
    style: { textAlign: 'right' },
  };
}

export function inputPropsForEmail() {
  return {
    type: 'email',
    inputMode: 'email',
    autoComplete: 'email',
    dir: 'ltr',
    autoCapitalize: 'off',
    style: { textAlign: 'right' },
  };
}

export function inputPropsForName() {
  return {
    type: 'text',
    autoComplete: 'name',
    autoCapitalize: 'words',
  };
}

export function inputPropsForAddress() {
  return {
    type: 'text',
    autoComplete: 'street-address',
    autoCapitalize: 'words',
  };
}

export function inputPropsForCity() {
  return {
    type: 'text',
    autoComplete: 'address-level2',
    autoCapitalize: 'words',
  };
}
