import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { z } from 'zod';
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
