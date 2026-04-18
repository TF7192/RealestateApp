import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireUser } from '../middleware/auth.js';

const KINDS = [
  'BUY_PRIVATE',
  'RENT_PRIVATE',
  'BUY_COMMERCIAL',
  'RENT_COMMERCIAL',
  'TRANSFER',
] as const;

// Default templates — used when the agent hasn't created one yet.
// All placeholders use the {{var}} syntax; `features` is auto-generated as a
// comma-list, and agent-* vars resolve to empty on the TRANSFER template.
const DEFAULT_BODIES: Record<string, string> = {
  BUY_PRIVATE:
    `🏡 *{{type}} למכירה — {{street}}, {{city}}*

💰 מחיר: {{price}}
🛏️ {{rooms}} חדרים · {{sqm}} מ״ר
🏢 קומה {{floor}} מתוך {{totalFloors}}
✨ {{features}}
🧭 כיווני אוויר: {{airDirections}}
🛠️ מצב הנכס: {{renovated}}
📅 פינוי: {{vacancyDate}}

📷 לפרטים ותמונות:
{{propertyUrl}}

—
{{agentName}} · {{agentAgency}} · {{agentPhone}}`,

  RENT_PRIVATE:
    `🏡 *{{type}} להשכרה — {{street}}, {{city}}*

💰 שכירות: {{price}}
🛏️ {{rooms}} חדרים · {{sqm}} מ״ר
🏢 קומה {{floor}} מתוך {{totalFloors}}
✨ {{features}}
📅 כניסה: {{vacancyDate}}

📷 פרטים נוספים:
{{propertyUrl}}

—
{{agentName}} · {{agentPhone}}`,

  BUY_COMMERCIAL:
    `🏢 *{{type}} למכירה — {{street}}, {{city}}*

💰 מחיר: {{price}}
📐 שטח: {{sqm}} מ״ר (ארנונה: {{sqmArnona}} מ״ר)
🏢 קומה {{floor}}/{{totalFloors}}
✨ {{features}}
🛠️ מצב: {{renovated}}
📅 פינוי: {{vacancyDate}}

📷 פרטים מלאים:
{{propertyUrl}}

—
{{agentName}} · {{agentAgency}} · {{agentPhone}}`,

  RENT_COMMERCIAL:
    `🏢 *{{type}} להשכרה — {{street}}, {{city}}*

💰 שכירות: {{price}}
📐 שטח: {{sqm}} מ״ר (ארנונה: {{sqmArnona}} מ״ר)
🏢 קומה {{floor}}/{{totalFloors}}
✨ {{features}}
📅 כניסה: {{vacancyDate}}

📷 לפרטים:
{{propertyUrl}}

—
{{agentName}} · {{agentPhone}}`,

  TRANSFER:
    `🔁 *העברה בין סוכנים*
{{type}} ב{{street}}, {{city}}

💰 {{price}}
🛏️ {{rooms}} חדרים · {{sqm}} מ״ר
🏢 קומה {{floor}}/{{totalFloors}}
✨ {{features}}
🛠️ מצב: {{renovated}}
📅 פינוי: {{vacancyDate}}
{{notes}}

📷 פרטים ותמונות:
{{propertyUrl}}`,
};

export const registerTemplateRoutes: FastifyPluginAsync = async (app) => {
  // List all templates — always returns a row per kind (custom or default).
  app.get('/', { onRequest: [app.requireAgent] }, async (req) => {
    const uid = requireUser(req).id;
    const existing = await prisma.messageTemplate.findMany({
      where: { agentId: uid },
    });
    const byKind: Record<string, any> = {};
    for (const t of existing) byKind[t.kind] = t;
    const list = KINDS.map((k) => {
      if (byKind[k]) return { kind: k, body: byKind[k].body, updatedAt: byKind[k].updatedAt, custom: true };
      return { kind: k, body: DEFAULT_BODIES[k], updatedAt: null, custom: false };
    });
    return { templates: list };
  });

  const upsertSchema = z.object({
    body: z.string().min(1).max(4000),
  });
  app.put('/:kind', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { kind } = req.params as { kind: string };
    if (!(KINDS as readonly string[]).includes(kind)) {
      return reply.code(400).send({ error: { message: 'Unknown template kind' } });
    }
    const body = upsertSchema.parse(req.body);
    const uid = requireUser(req).id;
    const t = await prisma.messageTemplate.upsert({
      where: { agentId_kind: { agentId: uid, kind: kind as any } },
      create: { agentId: uid, kind: kind as any, body: body.body },
      update: { body: body.body },
    });
    return { template: { kind: t.kind, body: t.body, updatedAt: t.updatedAt, custom: true } };
  });

  // Revert to default
  app.delete('/:kind', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { kind } = req.params as { kind: string };
    if (!(KINDS as readonly string[]).includes(kind)) {
      return reply.code(400).send({ error: { message: 'Unknown template kind' } });
    }
    const uid = requireUser(req).id;
    await prisma.messageTemplate.deleteMany({
      where: { agentId: uid, kind: kind as any },
    });
    return { ok: true, kind, body: DEFAULT_BODIES[kind], custom: false };
  });
};
