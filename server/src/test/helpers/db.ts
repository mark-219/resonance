import { sql } from 'drizzle-orm';
import { db } from '../../db/index.js';

export async function cleanDatabase() {
  await db.execute(sql`TRUNCATE users, sessions CASCADE`);
}
