// Conservative HTML sanitizer for agent-supplied brokerageTermsHtml.
// Mirrors the frontend allowlist in ProspectSign.jsx so the same set
// of tags survives at every layer. Server-side enforcement is defense
// in depth: stored XSS in the prospect public flow would otherwise
// rely entirely on the client sanitizer holding up.
//
// Strategy: regex-walk every tag, drop any tag not in the allowlist
// (keep its inner text), and strip ALL attributes from allowed tags
// so href/javascript: / on* / style sinks can never survive.
//
// We explicitly drop entire <script>, <style>, <iframe>, <object>,
// <embed>, <link>, <meta>, <noscript>, <svg>, <math> nodes — keeping
// their inner content would let an attacker smuggle live code.

const ALLOWED_TAGS = new Set([
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'div',
]);

const DROP_WITH_CONTENT = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'link', 'meta',
  'noscript', 'svg', 'math', 'template', 'frame', 'frameset',
]);

export function sanitizeBrokerageTermsHtml(raw: string | null | undefined): string {
  if (!raw) return '';
  let s = String(raw);

  // 1. Drop entire dangerous nodes (tag + content + closing tag).
  for (const tag of DROP_WITH_CONTENT) {
    const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, 'gi');
    s = s.replace(re, '');
    // Also drop self-closing or stray opening tags of the same kind.
    const reOpen = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi');
    s = s.replace(reOpen, '');
  }

  // 2. Drop HTML comments — they can hide conditional-comment XSS
  //    on legacy IE and confuse downstream parsers.
  s = s.replace(/<!--[\s\S]*?-->/g, '');

  // 3. Walk every remaining tag. Strip ALL attributes from allowed
  //    tags; remove disallowed tags entirely (keep their text).
  s = s.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (match, tagName: string) => {
    const lower = tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(lower)) return '';
    const isClosing = match.startsWith('</');
    const isSelfClosing = /\/\s*>$/.test(match);
    if (isClosing) return `</${lower}>`;
    return isSelfClosing ? `<${lower} />` : `<${lower}>`;
  });

  return s;
}
