// Minimal stub — will be superseded by Agent B's implementation at
// integration time.
//
// Props (must match Agent B's contract):
//   scope: { leadId?: string, propertyId?: string, customerId?: string }

export default function ActivityPanel({ scope }) {
  return (
    <div
      className="activity-panel-stub"
      data-scope={JSON.stringify(scope || {})}
    >
      <h3>פעילות</h3>
    </div>
  );
}
