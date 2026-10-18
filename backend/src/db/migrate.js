// Tiny migration runner: applies db/migrations/*.sql in filename order and
// remembers what it has applied. `--reset` wipes the schema first.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { config } from '../config.js'

const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations')

export async function migrate({ reset = false } = {}) {
  const client = new pg.Client({ connectionString: config.databaseUrl })
  await client.connect()
  try {
    if (reset) {
      await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
      console.log('Schema dropped')
    }

    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`)
    const appliedRows = await client.query('SELECT filename FROM schema_migrations')
    const alreadyApplied = new Set(appliedRows.rows.map((row) => row.filename))

    const files = fs.readdirSync(migrationsFolder).filter((name) => name.endsWith('.sql')).sort()
    for (const fileName of files) {
      if (alreadyApplied.has(fileName)) continue
      const sql = fs.readFileSync(path.join(migrationsFolder, fileName), 'utf8')
      // Each file runs in one transaction so a failure leaves nothing half-applied
      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [fileName])
        await client.query('COMMIT')
        console.log(`Applied ${fileName}`)
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
    }
  } finally {
    await client.end()
  }
}

// Run directly: `node src/db/migrate.js [--reset]`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await migrate({ reset: process.argv.includes('--reset') })
}
