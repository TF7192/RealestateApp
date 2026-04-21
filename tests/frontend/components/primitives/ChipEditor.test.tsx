import { describe, it, expect } from 'vitest';
import { render } from '../../setup/test-utils';
// eslint-disable-next-line import/no-relative-packages
import ChipEditor, {
  stringToHTML,
  htmlToString,
} from '@estia/frontend/components/ChipEditor.jsx';

describe('stringToHTML / htmlToString (pure)', () => {
  const LABEL_OF = { city: 'עיר', type: 'סוג', price: 'מחיר' };

  it('renders {{var}} tokens as chip spans', () => {
    const html = stringToHTML('דירה ב{{city}}', LABEL_OF);
    expect(html).toContain('chip-ed-chip');
    expect(html).toContain('data-var="city"');
    // The chip contains the Hebrew label, not the raw key.
    expect(html).toContain('עיר');
  });

  it('escapes HTML between tokens', () => {
    const html = stringToHTML('<b>{{city}}</b>', LABEL_OF);
    expect(html).toContain('&lt;b&gt;');
  });

  it('splits multi-line input by <br>', () => {
    const html = stringToHTML('line1\n{{city}}', LABEL_OF);
    expect(html).toContain('<br>');
  });

  it('round-trips {{city}} back to {{city}} after DOM serialization', () => {
    const el = document.createElement('div');
    el.innerHTML = stringToHTML('at {{city}}', LABEL_OF);
    const back = htmlToString(el);
    expect(back).toContain('{{city}}');
    expect(back).toContain('at ');
  });

  it('htmlToString emits a newline between <div>s (Safari Enter shape)', () => {
    const el = document.createElement('div');
    el.innerHTML = 'line1<div>line2</div>';
    expect(htmlToString(el)).toBe('line1\nline2');
  });

  it('htmlToString ignores the × glyph inside chips (data-x)', () => {
    const el = document.createElement('div');
    el.innerHTML = '<span class="chip-ed-chip" data-var="city">עיר<span class="chip-ed-chip-x" data-x="1">×</span></span>';
    expect(htmlToString(el)).toBe('{{city}}');
  });
});

describe('<ChipEditor> DOM', () => {
  it('mounts a role=textbox contentEditable element with the placeholder attr', () => {
    const { container } = render(
      <ChipEditor value="" onChange={() => {}} placeholder="הקלד…" labelOf={{}} />
    );
    const ed = container.querySelector('[role="textbox"]')!;
    expect(ed).toBeTruthy();
    expect(ed.getAttribute('contenteditable')).toBe('true');
    expect(ed.getAttribute('data-placeholder')).toBe('הקלד…');
    expect(ed.getAttribute('dir')).toBe('rtl');
  });

  it('renders chip pills for {{var}} tokens on initial mount', () => {
    const { container } = render(
      <ChipEditor value="דירה ב{{city}}" onChange={() => {}} labelOf={{ city: 'עיר' }} />
    );
    const chip = container.querySelector('.chip-ed-chip');
    expect(chip).toBeTruthy();
    expect(chip).toHaveAttribute('data-var', 'city');
    expect(chip?.textContent).toContain('עיר');
  });
});
