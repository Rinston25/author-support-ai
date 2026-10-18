import bcrypt from 'bcryptjs'
import { AppError, unauthorized } from '../../lib/httpErrors.js'
import { findUserByEmail, findUserById } from './repository.js'

// Compared against when the email is unknown, so "no such user" and
// "wrong password" take about the same time.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10)

function toPublicUser(user) {
  return { id: user.id, email: user.email, name: user.name, role: user.role, authorId: user.authorId }
}

export async function login(fastify, email, password) {
  const user = await findUserByEmail(fastify.db, email)
  const passwordMatches = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH)

  // Same message for both failures so the API doesn't reveal which emails exist
  if (!user || !passwordMatches) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect')
  }

  const token = fastify.jwt.sign({ userId: user.id, role: user.role, authorId: user.authorId })
  return { token, user: toPublicUser(user) }
}

export async function getCurrentUser(fastify, userId) {
  const user = await findUserById(fastify.db, userId)
  // Token is valid but the user was deleted since it was issued
  if (!user) throw unauthorized()
  return toPublicUser(user)
}
