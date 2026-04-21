// Minimal stub — will be superseded by Agent B's implementation at
// integration time.
//
// Props (must match Agent B's contract):
//   leadId?: string      → calls api.leadMatches
//   propertyId?: string  → calls api.propertyMatchingCustomers

export default function MatchingList({ leadId, propertyId }) {
  return (
    <div
      className="matching-list-stub"
      data-lead-id={leadId || ''}
      data-property-id={propertyId || ''}
    >
      <h3>התאמות</h3>
    </div>
  );
}
