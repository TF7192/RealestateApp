import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useCallback,
} from 'react';
import './ChipEditor.css';

// Selection saved any time the editor's caret moves — used to restore
// position when the user clicks a variable button outside the editor.
const SELECTION_SAVE_INTERVAL_MS = 0;

/**
 * ChipEditor — contentEditable editor that displays {{var}} tokens as visible
 * Hebrew pills. The stored value remains a plain string with {{var}} tokens,
 * but users only ever see Hebrew labels. Works on desktop + iOS Safari.
 *
 * - Chips are contenteditable=false so backspace deletes them atomically.
 * - A non-breaking space is inserted after each programmatic chip insert so
 *   users can type immediately after.
 * - DOM is the source of truth between re-renders; we only rehydrate when the
 *   external `value` prop changes (e.g. preset applied, kind switched).
 */
const ChipEditor = forwardRef(function ChipEditor(
  { value, onChange, placeholder, labelOf, variableValues = {} },
  ref
) {
  const divRef = useRef(null);
  const lastValueRef = useRef('');
  // Snapshot of the most recent caret/selection inside the editor. Used to
  // restore the cursor when an external button (variable picker) is clicked,
  // since clicking a button blurs the contentEditable and collapses the range.
  const lastRangeRef = useRef(null);

  // Rehydrate DOM only when the external value differs from the serialized DOM
  useEffect(() => {
    if (!divRef.current) return;
    if (value === lastValueRef.current) return;
    divRef.current.innerHTML = stringToHTML(value, labelOf);
    lastValueRef.current = value;
    lastRangeRef.current = null;
    decorateChips(divRef.current, variableValues);
  }, [value, labelOf, variableValues]);

  // Re-decorate chip tooltips when variable values change
  useEffect(() => {
    if (divRef.current) decorateChips(divRef.current, variableValues);
  }, [variableValues]);

  // Save the live selection whenever it changes inside the editor.
  // This lets us restore the caret after a button click steals focus.
  useEffect(() => {
    const onSelChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const r = sel.getRangeAt(0);
      if (divRef.current?.contains(r.commonAncestorContainer)) {
        lastRangeRef.current = r.cloneRange();
      }
    };
    document.addEventListener('selectionchange', onSelChange);
    return () => document.removeEventListener('selectionchange', onSelChange);
  }, []);

  const serialize = useCallback(() => {
    if (!divRef.current) return '';
    const str = htmlToString(divRef.current);
    lastValueRef.current = str;
    return str;
  }, []);

  const handleInput = useCallback(() => {
    const str = serialize();
    onChange?.(str);
  }, [onChange, serialize]);

  const insertChip = useCallback(
    (key, label) => {
      const editor = divRef.current;
      if (!editor) return;

      // Get the live selection (works when caller used onMouseDown
      // preventDefault to avoid blur). Fall back to last saved range, then
      // to "end of editor" as last resort.
      let range = null;
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && editor.contains(sel.anchorNode)) {
        range = sel.getRangeAt(0);
      } else if (
        lastRangeRef.current &&
        editor.contains(lastRangeRef.current.commonAncestorContainer)
      ) {
        range = lastRangeRef.current.cloneRange();
      } else {
        editor.focus();
        range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
      }

      range.deleteContents();

      const chip = document.createElement('span');
      chip.className = 'chip-ed-chip chip-ed-chip-pop';
      chip.dataset.var = key;
      chip.contentEditable = 'false';
      chip.setAttribute('dir', 'rtl');
      chip.textContent = label;
      if (variableValues[key]) chip.title = `${label} · ${variableValues[key]}`;

      // Inline × delete button (visible on hover) so users can remove a chip
      // with a single click. Marked data-x so the click handler can spot it.
      const x = document.createElement('span');
      x.className = 'chip-ed-chip-x';
      x.setAttribute('data-x', '1');
      x.contentEditable = 'false';
      x.textContent = '×';
      chip.appendChild(x);

      const space = document.createTextNode('\u00A0');
      range.insertNode(space);
      range.insertNode(chip);

      // Place cursor after the trailing space so user can keep typing
      const after = document.createRange();
      after.setStartAfter(space);
      after.setEndAfter(space);
      const sel2 = window.getSelection();
      sel2.removeAllRanges();
      sel2.addRange(after);
      lastRangeRef.current = after.cloneRange();

      setTimeout(() => chip.classList.remove('chip-ed-chip-pop'), 400);

      handleInput();
    },
    [handleInput, variableValues]
  );

  // Handle clicks on chips: tap the × area to delete the whole chip
  const handleClick = useCallback(
    (e) => {
      const target = e.target;
      if (
        target.classList?.contains('chip-ed-chip-x') ||
        target.dataset?.x === '1'
      ) {
        e.preventDefault();
        e.stopPropagation();
        const chip = target.closest('.chip-ed-chip');
        if (chip && divRef.current?.contains(chip)) {
          chip.remove();
          handleInput();
        }
      }
    },
    [handleInput]
  );

  // Strip formatting on paste — keeps the editor plain-text safe
  const handlePaste = useCallback((e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    if (!text) return;
    document.execCommand('insertText', false, text);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      insertVariable: insertChip,
      focus: () => divRef.current?.focus(),
      clear: () => {
        if (!divRef.current) return;
        divRef.current.innerHTML = '';
        lastValueRef.current = '';
        onChange?.('');
      },
    }),
    [insertChip, onChange]
  );

  return (
    <div
      ref={divRef}
      className="chip-ed"
      contentEditable
      suppressContentEditableWarning
      onInput={handleInput}
      onClick={handleClick}
      onPaste={handlePaste}
      dir="rtl"
      spellCheck={false}
      data-placeholder={placeholder}
      role="textbox"
      aria-multiline="true"
    />
  );
});

export default ChipEditor;

// ──────────────────────────────────────────────────────────────────────────
// Helpers — parse/serialize between `{{var}}` strings and chip-DOM
// ──────────────────────────────────────────────────────────────────────────

const TOKEN_RE = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;

function escapeHTML(s) {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

export function stringToHTML(body, labelOf) {
  if (!body) return '';
  const lines = body.split('\n');
  const get = typeof labelOf === 'function' ? labelOf : (k) => labelOf?.[k] || k;
  return lines
    .map((line) => {
      let out = '';
      let last = 0;
      let m;
      TOKEN_RE.lastIndex = 0;
      while ((m = TOKEN_RE.exec(line)) !== null) {
        out += escapeHTML(line.slice(last, m.index));
        const key = m[1];
        const label = get(key) || key;
        out +=
          `<span class="chip-ed-chip" data-var="${escapeHTML(key)}"` +
          ` contenteditable="false" dir="rtl">` +
          escapeHTML(label) +
          `<span class="chip-ed-chip-x" data-x="1" contenteditable="false">×</span>` +
          `</span>`;
        last = m.index + m[0].length;
      }
      out += escapeHTML(line.slice(last));
      return out || '<br>';
    })
    .join('<br>');
}

export function htmlToString(root) {
  let out = '';
  for (const node of root.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = node.tagName;
      if (tag === 'BR') {
        out += '\n';
      } else if (tag === 'DIV' || tag === 'P') {
        // Safari wraps paragraphs in <div>/<p> after Enter; normalize to \n
        if (out && !out.endsWith('\n')) out += '\n';
        out += htmlToString(node);
      } else if (node.classList && node.classList.contains('chip-ed-chip')) {
        // Skip the × glyph child — only emit the {{var}} token
        const k = node.dataset.var;
        if (k) out += `{{${k}}}`;
      } else if (node.classList && node.classList.contains('chip-ed-chip-x')) {
        // standalone × element (shouldn't normally happen) — skip
      } else {
        out += htmlToString(node);
      }
    }
  }
  // Strip one leading newline that Safari sometimes adds
  return out.replace(/^\n+/, '');
}

// Attach tooltip (title attribute) and × button to each chip so users can
// see the resolved value and delete via tap.
function decorateChips(root, values) {
  const chips = root.querySelectorAll('.chip-ed-chip');
  chips.forEach((chip) => {
    const key = chip.dataset.var;
    const v = values?.[key];
    if (v) chip.title = `${chip.textContent} · ${v}`;
  });
}
