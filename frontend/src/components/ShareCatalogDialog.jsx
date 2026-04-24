// ShareCatalogDialog — thin wrapper around the universal ShareDialog
// (Sprint 7). Kept for backwards compat with call sites that pass
// `{ catalogUrl, agentName, onClose }`. New code should import and
// use `<ShareDialog kind="catalog" entity={{ url, agentName }} />`
// directly.

import ShareDialog from './ShareDialog';

export default function ShareCatalogDialog({ catalogUrl, agentName, onClose }) {
  return (
    <ShareDialog
      kind="catalog"
      entity={{ url: catalogUrl, agentName }}
      onClose={onClose}
    />
  );
}
