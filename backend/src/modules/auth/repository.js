// SQL only.
export async function findUserByEmail(db, email) {
  const result = await db.query(
    `SELECT id, email, password_hash AS "passwordHash", role, name, author_id AS "authorId"
     FROM users WHERE email = $1`,
    [email.toLowerCase()],
  )
  return result.rows[0] || null
}

export async function findUserById(db, userId) {
  const result = await db.query(
    `SELECT id, email, role, name, author_id AS "authorId" FROM users WHERE id = $1`,
    [userId],
  )
  return result.rows[0] || null
}
