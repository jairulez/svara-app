import { migrate } from '../server/lib/db.js';
import { config } from '../server/lib/config.js';

const ran = migrate();
console.log(ran.length ? `Applied migrations: ${ran.join(', ')}` : 'Database is up to date.', `(${config.dbPath})`);
