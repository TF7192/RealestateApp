import type { FastifyPluginAsync } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireUser } from '../middleware/auth.js';
import {
  asString, asInt, asFloat, asBool, asIsraeliPhone,
  splitFullName, splitAddress,
  asLookingFor, asInterestType, asAssetClass, asPropertyCategory,
  CellError,
} from '../lib/importNormalize.js';
import { headerSignature, detectColumns, type EntityType } from '../lib/importDetect.js';

// Excel / CSV import routes.
//
// Shape:
//   POST /api/import/:entityType/start  → { jobId }
//     Body: { mapping: {header→field}, rows: [{header: value, ...}],
//             options: { skipDuplicates, defaultCity, batchId } }
//   GET  /api/import/jobs/:id           → { status, progress, result }
//   GET  /api/import/mappings           → saved mappings for the agent
//   PUT  /api/import/mappings           → upsert a mapping by headerSig
//
// The agent's browser handles file parsing (SheetJS client-side) and
// sends us an already-normalized `{ header: value }` payload plus the
// mapping choices. This keeps the uploaded file off our servers and
// sidesteps multipart-upload handling for the first cut.

// Per-process job queue, same pattern as yad2.ts / market.ts.
type JobKind = 'LEAD' | 'PROPERTY';
interface ImportJob {
  id: string;
  agentId: string;
  kind: JobKind;
  status: 'running' | 'done' | 'error';
  total: number;
  processed: number;
  created: number;
  skipped: number;
  failed: number;
  errors: { rowIndex: number; reason: string }[];
  batchId: string;
  startedAt: number;
  finishedAt?: number;
  errorMsg?: string;
}
const jobs = new Map<string, ImportJob>();
const JOB_TTL_MS = 30 * 60 * 1000;
const jobGc = setInterval(() => {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, j] of jobs) {
    const ts = j.finishedAt ?? j.startedAt;
    if (ts < cutoff) jobs.delete(id);
  }
}, 5 * 60 * 1000);
jobGc.unref?.();

const RowSchema = z.record(z.unknown());
const StartBody = z.object({
  mapping: z.record(z.string().nullable()),
  rows: z.array(RowSchema).min(1).max(2000),
  options: z.object({
    skipDuplicates: z.boolean().default(true),
    defaultCity: z.string().trim().min(1).max(80).optional(),
    // Lets the agent import leads whose phone field is empty — the
    // row still lands, phone stays null. Off by default because a
    // lead without contact info is usually a data-entry mistake.
    allowEmptyPhone: z.boolean().default(false),
  }).default({ skipDuplicates: true, allowEmptyPhone: false }),
});

export const registerImportRoutes: FastifyPluginAsync = async (app) => {
  // ── Saved mappings ───────────────────────────────────────────────
  app.get('/mappings', { onRequest: [app.requireAgent] }, async (req) => {
    const u = requireUser(req);
    const { entityType, headerSig } = req.query as { entityType?: string; headerSig?: string };
    if (!entityType) return { items: [] };
    const where: any = { agentId: u.id, entityType };
    if (headerSig) where.headerSig = headerSig;
    const items = await prisma.importMapping.findMany({ where, orderBy: { updatedAt: 'desc' } });
    return { items };
  });

  app.put('/mappings', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const u = requireUser(req);
    const body = z.object({
      entityType: z.enum(['LEAD', 'PROPERTY']),
      headerSig:  z.string().min(1).max(400),
      mapping:    z.record(z.string().nullable()),
    }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: { message: 'Invalid mapping payload' } });
    const row = await prisma.importMapping.upsert({
      where: { agentId_entityType_headerSig: {
        agentId: u.id, entityType: body.data.entityType, headerSig: body.data.headerSig,
      } },
      create: { agentId: u.id, ...body.data },
      update: { mapping: body.data.mapping },
    });
    return { mapping: row };
  });

  // ── Start an import ──────────────────────────────────────────────
  app.post('/:entityType/start', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { entityType } = req.params as { entityType: string };
    const kind = entityType === 'leads' ? 'LEAD' : entityType === 'properties' ? 'PROPERTY' : null;
    if (!kind) return reply.code(400).send({ error: { message: 'Unknown entity type' } });

    const parsed = StartBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { message: 'Invalid import payload', detail: parsed.error.flatten() } });
    }
    const u = requireUser(req);
    const batchId = randomUUID();
    const job: ImportJob = {
      id: randomUUID(),
      agentId: u.id,
      kind,
      status: 'running',
      total: parsed.data.rows.length,
      processed: 0, created: 0, skipped: 0, failed: 0,
      errors: [],
      batchId,
      startedAt: Date.now(),
    };
    jobs.set(job.id, job);

    const run = kind === 'LEAD' ? runLeadImport : runPropertyImport;
    Promise.resolve().then(async () => {
      try {
        await run(job, parsed.data.mapping, parsed.data.rows, parsed.data.options, u.id);
        job.status = 'done';
      } catch (err: any) {
        req.log.error({ err, jobId: job.id }, 'import job threw');
        job.status = 'error';
        job.errorMsg = err?.message || 'שגיאה לא צפויה';
      } finally {
        job.finishedAt = Date.now();
      }
    });

    return reply.code(202).send({ jobId: job.id, batchId });
  });

  // ── Job status polling ───────────────────────────────────────────
  app.get('/jobs/:id', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const u = requireUser(req);
    const { id } = req.params as { id: string };
    const job = jobs.get(id);
    if (!job) return reply.code(404).send({ error: { message: 'Job not found or expired' } });
    if (job.agentId !== u.id) return reply.code(403).send({ error: { message: 'Forbidden' } });
    return {
      status: job.status,
      kind: job.kind,
      total: job.total,
      processed: job.processed,
      created: job.created,
      skipped: job.skipped,
      failed: job.failed,
      errors: job.errors.slice(0, 200),
      batchId: job.batchId,
      errorMsg: job.errorMsg,
    };
  });
};

// ── Lead row runner ─────────────────────────────────────────────────
async function runLeadImport(
  job: ImportJob,
  mapping: Record<string, string | null>,
  rows: Record<string, unknown>[],
  options: z.infer<typeof StartBody>['options'],
  agentId: string,
) {
  // Invert the mapping so we can look up value by target field.
  const invert = (row: Record<string, unknown>, field: string): unknown => {
    for (const [h, f] of Object.entries(mapping)) if (f === field) return row[h];
    return undefined;
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    job.processed = i;
    try {
      // Name can arrive as a single "שם" column or split as firstName/lastName.
      let firstName = asString(invert(row, 'firstName'));
      let lastName  = asString(invert(row, 'lastName'));
      if (!firstName && !lastName) {
        const split = splitFullName(invert(row, 'name'));
        firstName = split.firstName;
        lastName  = split.lastName;
      }
      const name = [firstName, lastName].filter(Boolean).join(' ').trim();
      const phone = asIsraeliPhone(invert(row, 'phone'));
      if (!name) throw new CellError('שם חסר — שורה דולגה');
      if (!phone && !options.allowEmptyPhone) throw new CellError('טלפון חסר או לא תקין');

      // Dedup by normalized phone within this agent's leads.
      if (phone && options.skipDuplicates) {
        const dup = await prisma.lead.findFirst({
          where: { agentId, phone }, select: { id: true },
        });
        if (dup) { job.skipped += 1; continue; }
      }

      const streetRaw = asString(invert(row, 'street'));
      const cityRaw   = asString(invert(row, 'city'));
      // If the file packs "street, city" into a single column, the
      // detector mapped it to `street` but the value looks like an
      // address. Split on last comma; prefer city from the dedicated
      // column if one exists.
      const addrSplit = splitAddress(streetRaw);
      const city   = cityRaw ?? addrSplit.city ?? options.defaultCity ?? null;
      const street = streetRaw && cityRaw ? streetRaw : addrSplit.street;

      // Lead schema packs price as a single `budget: Int?` + a free-text
      // `priceRangeLabel`, and rooms as a free-text `rooms: String?`.
      // If the sheet provides a min/max pair, we store the max as
      // budget (agent's upper bound) and concatenate the label.
      const priceMin = asInt(invert(row, 'priceMin'));
      const priceMax = asInt(invert(row, 'priceMax'));
      const budget   = priceMax ?? priceMin ?? null;
      const priceLabel = priceMin && priceMax
        ? `${priceMin.toLocaleString('he-IL')} – ${priceMax.toLocaleString('he-IL')} ₪`
        : priceMax
          ? `עד ${priceMax.toLocaleString('he-IL')} ₪`
          : priceMin
            ? `מ-${priceMin.toLocaleString('he-IL')} ₪`
            : null;
      const roomsMin = asFloat(invert(row, 'roomsMin'));
      const roomsMax = asFloat(invert(row, 'roomsMax'));
      const roomsLabel = roomsMin && roomsMax
        ? (roomsMin === roomsMax ? `${roomsMin}` : `${roomsMin}–${roomsMax}`)
        : roomsMax
          ? `עד ${roomsMax}`
          : roomsMin
            ? `מ-${roomsMin}`
            : null;

      await prisma.lead.create({
        data: {
          agentId,
          name,
          phone: phone ?? '',
          email:         asString(invert(row, 'email')) ?? undefined,
          city:          city ?? undefined,
          street:        street ?? undefined,
          lookingFor:    asLookingFor(invert(row, 'lookingFor')) ?? undefined,
          interestType:  asInterestType(invert(row, 'interestType')) ?? undefined,
          budget:        budget ?? undefined,
          priceRangeLabel: priceLabel ?? undefined,
          rooms:         roomsLabel ?? undefined,
          source:        asString(invert(row, 'source')) ?? undefined,
          notes:         asString(invert(row, 'notes')) ?? undefined,
          importBatchId: job.batchId,
        },
      });
      job.created += 1;
    } catch (e: any) {
      job.failed += 1;
      job.errors.push({ rowIndex: i, reason: e instanceof CellError ? e.message : (e?.message || 'שגיאה לא צפויה') });
    }
  }
  job.processed = rows.length;
}

// ── Property row runner ─────────────────────────────────────────────
async function runPropertyImport(
  job: ImportJob,
  mapping: Record<string, string | null>,
  rows: Record<string, unknown>[],
  options: z.infer<typeof StartBody>['options'],
  agentId: string,
) {
  const invert = (row: Record<string, unknown>, field: string): unknown => {
    for (const [h, f] of Object.entries(mapping)) if (f === field) return row[h];
    return undefined;
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    job.processed = i;
    try {
      const streetRaw = asString(invert(row, 'street'));
      const cityRaw   = asString(invert(row, 'city'));
      const addrSplit = splitAddress(streetRaw);
      const city   = cityRaw ?? addrSplit.city ?? options.defaultCity ?? null;
      const street = streetRaw && cityRaw ? streetRaw : addrSplit.street;

      if (!street) throw new CellError('רחוב חסר — שורה דולגה');
      if (!city)   throw new CellError('עיר חסרה — שורה דולגה או בחר עיר ברירת מחדל');

      // Dedup by (agentId, normalized street + city) within this agent's props.
      if (options.skipDuplicates) {
        const nStreet = street.trim().toLowerCase();
        const nCity   = city.trim().toLowerCase();
        const dup = await prisma.property.findFirst({
          where: { agentId, street: { equals: street, mode: 'insensitive' }, city: { equals: city, mode: 'insensitive' } },
          select: { id: true },
        });
        void nStreet; void nCity;
        if (dup) { job.skipped += 1; continue; }
      }

      const assetClass = asAssetClass(invert(row, 'assetClass')) ?? 'RESIDENTIAL';
      const category   = asPropertyCategory(invert(row, 'category')) ?? 'SALE';
      const rooms      = asFloat(invert(row, 'rooms'));
      const sqm        = asFloat(invert(row, 'sqm'));
      const floor      = asInt(invert(row, 'floor'));
      const totalFloors = asInt(invert(row, 'totalFloors'));
      const marketingPrice = asInt(invert(row, 'marketingPrice')) ?? 0;
      const ownerName  = asString(invert(row, 'owner')) ?? 'לא צוין';
      const ownerPhone = asIsraeliPhone(invert(row, 'ownerPhone')) ?? '';
      const ownerEmail = asString(invert(row, 'ownerEmail'));
      const type       = asString(invert(row, 'type')) ?? 'דירה';
      // Fold neighborhood into the notes prefix so the info isn't lost.
      const neighborhood = asString(invert(row, 'neighborhood'));
      const notes = [
        neighborhood ? `שכונה: ${neighborhood}` : null,
        asString(invert(row, 'notes')),
      ].filter(Boolean).join('\n') || null;

      await prisma.property.create({
        data: {
          agentId,
          assetClass,
          category,
          type,
          street,
          city,
          rooms: rooms ?? undefined,
          sqm:   sqm ?? 0,
          floor: floor ?? undefined,
          totalFloors: totalFloors ?? undefined,
          marketingPrice,
          owner: ownerName,
          ownerPhone,
          ownerEmail: ownerEmail ?? undefined,
          elevator:         asBool(invert(row, 'elevator'))         ?? undefined,
          parking:          asBool(invert(row, 'parking'))          ?? undefined,
          storage:          asBool(invert(row, 'storage'))          ?? undefined,
          ac:               asBool(invert(row, 'airConditioning'))  ?? undefined,
          balconySize:      asFloat(invert(row, 'balconySize'))     ?? undefined,
          notes: notes ?? undefined,
          importBatchId: job.batchId,
        },
      });
      job.created += 1;
    } catch (e: any) {
      job.failed += 1;
      job.errors.push({ rowIndex: i, reason: e instanceof CellError ? e.message : (e?.message || 'שגיאה לא צפויה') });
    }
  }
  job.processed = rows.length;
}

// Re-export for tests.
export { headerSignature, detectColumns };
