// Sprint 5 / MLS parity — Task H3. Lightweight wrapper over the
// ActivityLog table. Callers pass (agentId, actor, verb, entity, …)
// and we persist a one-row audit entry. Never throws — a failed log
// write should not break the user-facing action.

import { prisma } from './prisma.js';

export interface ActivityEvent {
  agentId:    string;
  actorId?:   string | null;
  verb:       string;                 // "created" | "updated" | "deleted" | custom
  entityType: 'Property' | 'Lead' | 'Deal' | 'Owner' | 'Reminder' | 'Tag' | string;
  entityId?:  string | null;
  summary?:   string | null;          // one-line Hebrew description
  metadata?:  Record<string, unknown> | null;
}

export async function logActivity(ev: ActivityEvent): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        agentId:    ev.agentId,
        actorId:    ev.actorId   ?? null,
        verb:       ev.verb,
        entityType: ev.entityType,
        entityId:   ev.entityId  ?? null,
        summary:    ev.summary   ?? null,
        metadata:   (ev.metadata ?? null) as any,
      },
    });
  } catch {
    // Swallow — audit log failures must not cascade into user errors.
  }
}
