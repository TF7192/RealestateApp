// Local smoke test for the Playwright Yad2 crawler.
// Run: npx tsx src/scripts/yad2-smoke.ts <agencyId>
// Default agencyId is 7098700 (the one Adam reported was breaking).

import { crawlAgency } from '../lib/yad2-crawler.js';

const agencyId = process.argv[2] || '7098700';

(async () => {
  const t0 = Date.now();
  console.log(`Crawling agency ${agencyId}...`);
  const r = await crawlAgency(agencyId);
  const ms = Date.now() - t0;
  console.log(`\n=== Done in ${ms}ms ===`);
  console.log(`Agency: ${r.agencyName ?? '(unknown)'} ${r.agencyPhone ? '· ' + r.agencyPhone : ''}`);
  console.log(`Listings: ${r.listings.length} (truncated=${r.truncated})`);
  console.log('Per section:');
  for (const s of r.sections) {
    console.log(`  ${s.section}: ${s.totalListings} listings, ${s.pagesFetched}/${s.totalPages} pages` + (s.error ? ` ERR=${s.error}` : ''));
  }
  if (r.listings[0]) {
    console.log('\nFirst listing:');
    const l = r.listings[0];
    console.log(`  ${l.title || '(no title)'} — ${l.street}, ${l.city}`);
    console.log(`  ₪${l.price?.toLocaleString() ?? '—'} · ${l.rooms ?? '—'} rooms · ${l.sqm ?? '—'} sqm`);
    console.log(`  Images: ${l.images?.length ?? 0} (cover: ${l.coverImage ? 'yes' : 'no'})`);
  }
  process.exit(0);
})().catch((e) => {
  console.error('FAILED:', e);
  process.exit(1);
});
