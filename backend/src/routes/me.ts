import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { z } from 'zod';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { requireUser } from '../middleware/auth.js';

export const registerMeRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { onRequest: [app.requireAuth] }, async (req) => {
    const user = await prisma.user.findUnique({
      where: { id: requireUser(req).id },
      include: { agentProfile: true, customerProfile: true },
    });
    if (!user) return { user: null };
    return { user: toPublic(user) };
  });

  const updateSchema = z.object({
    displayName: z.string().min(1).max(120).optional(),
    phone: z.string().max(40).nullable().optional(),
    avatarUrl: z.string().url().nullable().optional(),
    agentProfile: z
      .object({
        agency: z.string().max(120).nullable().optional(),
        title: z.string().max(120).nullable().optional(),
        license: z.string().max(120).nullable().optional(),
        bio: z.string().max(2000).nullable().optional(),
      })
      .optional(),
  });

  app.patch('/', { onRequest: [app.requireAuth] }, async (req) => {
    const body = updateSchema.parse(req.body);
    await prisma.user.update({
      where: { id: requireUser(req).id },
      data: {
        displayName: body.displayName,
        phone: body.phone ?? undefined,
        avatarUrl: body.avatarUrl ?? undefined,
      },
    });
    if (body.agentProfile && requireUser(req).role === 'AGENT') {
      await prisma.agentProfile.update({
        where: { userId: requireUser(req).id },
        data: body.agentProfile,
      });
    }
    const user = await prisma.user.findUnique({
      where: { id: requireUser(req).id },
      include: { agentProfile: true, customerProfile: true },
    });
    return { user: user && toPublic(user) };
  });

  // Avatar upload — stores image under /uploads/avatars/{userId}/{uuid}.{ext}
  // and updates the user.avatarUrl. Public read path is /uploads/avatars/...
  app.post('/avatar', { onRequest: [app.requireAuth] }, async (req, reply) => {
    const uid = requireUser(req).id;
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: { message: 'No file' } });
    if (!file.mimetype.startsWith('image/')) {
      return reply.code(400).send({ error: { message: 'Only image files allowed' } });
    }
    const uploadsDir = path.resolve(process.env.UPLOADS_DIR || './uploads');
    const subDir = path.join(uploadsDir, 'avatars', uid);
    await fs.mkdir(subDir, { recursive: true });
    const ext = path.extname(file.filename) || '.png';
    const name = `${crypto.randomUUID()}${ext}`;
    const filePath = path.join(subDir, name);
    await fs.writeFile(filePath, await file.toBuffer());
    const rel = path.relative(uploadsDir, filePath).replaceAll(path.sep, '/');
    const url = `/uploads/${rel}`;
    await prisma.user.update({ where: { id: uid }, data: { avatarUrl: url } });
    const user = await prisma.user.findUnique({
      where: { id: uid },
      include: { agentProfile: true, customerProfile: true },
    });
    return { user: user && toPublic(user), url };
  });
};

function toPublic(user: any) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    displayName: user.displayName,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    agentProfile: user.agentProfile,
    customerProfile: user.customerProfile,
  };
}
