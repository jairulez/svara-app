// Usage: node scripts/seed.js [--reset]   (--reset rebuilds all demo users + history; reference data is always upserted)
import { migrate } from '../server/lib/db.js';
import { seedReference, seedDemo } from '../server/db/seed.js';

const reset = process.argv.includes('--reset');
migrate();
const ref = seedReference();
console.log('Reference data:', JSON.stringify(ref));
const demo = seedDemo({ reset });
console.log(demo.skipped ? 'Demo data already present (use --reset to rebuild).' : `Demo data seeded: ${JSON.stringify(demo.users)}`);
