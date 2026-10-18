// Runs `work(client)` inside one database transaction: everything is saved
// together, or (on any error) nothing is.
export async function withTransaction(db, work) {
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
