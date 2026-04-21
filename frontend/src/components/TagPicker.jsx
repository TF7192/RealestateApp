// Minimal stub — will be superseded by Agent B's implementation at
// integration time. Kept small so my tests render, and so the UI
// doesn't crash if Agent B's branch isn't merged yet.
//
// Props (must match Agent B's contract):
//   entityType: 'PROPERTY' | 'LEAD' | 'CUSTOMER' | 'OWNER' | 'DEAL'
//   entityId:   string

export default function TagPicker({ entityType, entityId }) {
  return (
    <div className="tag-picker-stub" data-entity-type={entityType} data-entity-id={entityId}>
      <span className="tag-picker-stub-label">תגיות</span>
    </div>
  );
}
