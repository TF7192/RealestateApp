import { useCallback, useEffect, useState } from 'react';

// Sprint 4 — useGlobalSearch. Owns the open/close state for the
// cmd-K global search palette and listens for the document-level
// keyboard shortcut + the `estia:open-palette` / `estia:close-palette`
// custom events dispatched from the top-bar search button and the
// mobile header search icon.
//
// Why a dedicated hook (and not live inside useGlobalShortcuts): the
// shortcut hook is an omnibus of N/L/G-prefix/help/etc., and the
// palette-open lifecycle is interesting enough on its own (window
// event bus + state) that pulling it out keeps each hook single-
// responsibility.
//
// Consumers get `{ open, openPalette, closePalette, togglePalette }`
// and should render their palette component conditional on `open`.
export function useGlobalSearch() {
  const [open, setOpen] = useState(false);

  const openPalette  = useCallback(() => setOpen(true),  []);
  const closePalette = useCallback(() => setOpen(false), []);
  const togglePalette = useCallback(() => setOpen((v) => !v), []);

  // ⌘K / Ctrl+K — works even while the user is typing inside an input
  // (matches every IDE + Linear + Raycast shortcut). The shortcut hook
  // used to own this; we keep a second listener here so apps that
  // only mount this hook (not the full shortcut suite) still get it.
  useEffect(() => {
    function onKey(e) {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Cross-component bus — the top-bar search button and the mobile
  // header icon dispatch these events without needing a reference
  // back up to AppRoutes's state setter. Decoupled on purpose.
  useEffect(() => {
    const onOpen  = () => setOpen(true);
    const onClose = () => setOpen(false);
    window.addEventListener('estia:open-palette',  onOpen);
    window.addEventListener('estia:close-palette', onClose);
    return () => {
      window.removeEventListener('estia:open-palette',  onOpen);
      window.removeEventListener('estia:close-palette', onClose);
    };
  }, []);

  return { open, openPalette, closePalette, togglePalette };
}

export default useGlobalSearch;
