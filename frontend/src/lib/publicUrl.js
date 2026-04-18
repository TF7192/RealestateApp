// Build SEO-friendly public URLs (or fall back to legacy short URLs).
//
// Agent / property objects always include `slug` after the SEO migration —
// but during the rollout we may still see records without it, so the helpers
// fall back to the older `/a/<id>` and `/p/<id>` shapes.

export function agentPublicUrl(agent) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  if (agent?.slug) return `${origin}/agents/${encodeURI(agent.slug)}`;
  if (agent?.id)   return `${origin}/a/${agent.id}`;
  return origin;
}

export function propertyPublicUrl(property, agent) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  if (property?.slug && (agent?.slug || property?.agentSlug)) {
    const a = agent?.slug || property.agentSlug;
    return `${origin}/agents/${encodeURI(a)}/${encodeURI(property.slug)}`;
  }
  if (property?.id) return `${origin}/p/${property.id}`;
  return origin;
}

// Path-only variants (no origin) for in-app `<Link to>`s
export function agentPublicPath(agent) {
  if (agent?.slug) return `/agents/${encodeURI(agent.slug)}`;
  if (agent?.id)   return `/a/${agent.id}`;
  return '/';
}

export function propertyPublicPath(property, agent) {
  if (property?.slug && (agent?.slug || property?.agentSlug)) {
    const a = agent?.slug || property.agentSlug;
    return `/agents/${encodeURI(a)}/${encodeURI(property.slug)}`;
  }
  if (property?.id) return `/p/${property.id}`;
  return '/';
}
