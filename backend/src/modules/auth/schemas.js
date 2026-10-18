const userSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    email: { type: 'string' },
    name: { type: 'string' },
    role: { type: 'string', enum: ['author', 'admin'] },
    authorId: { type: ['string', 'null'] },
  },
}

export const loginSchema = {
  tags: ['Auth'],
  summary: 'Log in with email and password',
  body: {
    type: 'object',
    required: ['email', 'password'],
    additionalProperties: false,
    properties: {
      email: { type: 'string', format: 'email', maxLength: 254 },
      password: { type: 'string', minLength: 1, maxLength: 200 },
    },
    examples: [{ email: 'priya.sharma@email.com', password: 'Author@123' }],
  },
  response: {
    200: {
      type: 'object',
      properties: { token: { type: 'string' }, user: userSchema },
    },
  },
}

export const meSchema = {
  tags: ['Auth'],
  summary: 'Get the logged-in user',
  security: [{ bearerAuth: [] }],
  response: { 200: { type: 'object', properties: { user: userSchema } } },
}
