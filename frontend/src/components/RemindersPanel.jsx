// Minimal stub — will be superseded by Agent B's implementation at
// integration time.
//
// Props (must match Agent B's contract):
//   scope: { leadId?: string, propertyId?: string, customerId?: string }

export default function RemindersPanel({ scope }) {
  return (
    <div
      className="reminders-panel-stub"
      data-scope={JSON.stringify(scope || {})}
    >
      <h3>תזכורות</h3>
      <p>—</p>
    </div>
  );
}
