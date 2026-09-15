import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { v4 as uuidv4 } from 'uuid'
import { db } from '../../database/connection'
import { User, RegisterDto, LoginDto, AuthResponse } from '../../types'

const JWT_SECRET = process.env.JWT_SECRET!
const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN || '7d') as jwt.SignOptions['expiresIn']
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '30d'

// ============================================
// Registro de novo usuário
// ============================================
export const register = async (dto: RegisterDto): Promise<AuthResponse> => {
  const existing = await db.query(
    'SELECT id FROM users WHERE email = $1',
    [dto.email.toLowerCase()]
  )

  if (existing.rows.length > 0) {
    throw new Error('Email já cadastrado')
  }

  const password_hash = await bcrypt.hash(dto.password, 12)

  const result = await db.query(
    `INSERT INTO users (email, password_hash, name, timezone)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [
      dto.email.toLowerCase(),
      password_hash,
      dto.name || null,
      dto.timezone || 'America/Sao_Paulo',
    ]
  )

  const user: User = result.rows[0]

  // Criar schedule padrão (22h todo dia, entrega no dashboard)
  await db.query(
    `INSERT INTO schedules (user_id, cron_expression, delivery_channels, report_format)
     VALUES ($1, $2, $3, $4)`,
    [user.id, '0 22 * * *', '{dashboard}', 'detailed']
  )

  return generateTokens(user)
}

// ============================================
// Login
// ============================================
export const login = async (dto: LoginDto): Promise<AuthResponse> => {
  const result = await db.query(
    'SELECT * FROM users WHERE email = $1 AND is_active = true',
    [dto.email.toLowerCase()]
  )

  if (result.rows.length === 0) {
    throw new Error('Credenciais inválidas')
  }

  const user: User = result.rows[0]
  const valid = await bcrypt.compare(dto.password, user.password_hash)

  if (!valid) {
    throw new Error('Credenciais inválidas')
  }

  await db.query(
    'UPDATE users SET last_login_at = NOW() WHERE id = $1',
    [user.id]
  )

  return generateTokens(user)
}

// ============================================
// Refresh token
// ============================================
export const refreshAccessToken = async (refreshToken: string): Promise<{ access_token: string }> => {
  const result = await db.query(
    `SELECT u.* FROM refresh_tokens rt
     JOIN users u ON u.id = rt.user_id
     WHERE rt.token_hash = $1 AND rt.expires_at > NOW() AND u.is_active = true`,
    [hashToken(refreshToken)]
  )

  if (result.rows.length === 0) {
    throw new Error('Refresh token inválido ou expirado')
  }

  const user: User = result.rows[0]
  const access_token = jwt.sign(
    { sub: user.id, email: user.email, plan: user.plan },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  )

  return { access_token }
}

// ============================================
// Logout (revoga refresh token)
// ============================================
export const logout = async (userId: string): Promise<void> => {
  await db.query(
    'DELETE FROM refresh_tokens WHERE user_id = $1',
    [userId]
  )
}

// ============================================
// Buscar usuário por ID
// ============================================
export const getUserById = async (userId: string): Promise<Omit<User, 'password_hash'> | null> => {
  const result = await db.query(
    `SELECT id, email, name, plan, timezone, language, is_active,
            email_verified, datagrow_user_id, last_login_at, created_at, updated_at
     FROM users WHERE id = $1`,
    [userId]
  )
  return result.rows[0] || null
}

// ============================================
// Atualizar preferências
// ============================================
export const updatePreferences = async (
  userId: string,
  prefs: { timezone?: string; language?: string; name?: string }
): Promise<void> => {
  const fields: string[] = []
  const values: unknown[] = []
  let paramCount = 1

  if (prefs.timezone) {
    fields.push(`timezone = $${paramCount++}`)
    values.push(prefs.timezone)
  }
  if (prefs.language) {
    fields.push(`language = $${paramCount++}`)
    values.push(prefs.language)
  }
  if (prefs.name) {
    fields.push(`name = $${paramCount++}`)
    values.push(prefs.name)
  }

  if (fields.length === 0) return

  values.push(userId)
  await db.query(
    `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramCount}`,
    values
  )
}

// ============================================
// Helpers internos
// ============================================

const generateTokens = async (user: User): Promise<AuthResponse> => {
  const access_token = jwt.sign(
    { sub: user.id, email: user.email, plan: user.plan },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  )

  const refresh_token = uuidv4()
  const refresh_expires = new Date()
  refresh_expires.setDate(refresh_expires.getDate() + 30)

  await db.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [user.id, hashToken(refresh_token), refresh_expires]
  )

  // Limpar tokens expirados do usuário
  await db.query(
    'DELETE FROM refresh_tokens WHERE user_id = $1 AND expires_at < NOW()',
    [user.id]
  )

  const { password_hash, ...userWithoutPassword } = user

  return {
    access_token,
    refresh_token,
    user: userWithoutPassword,
  }
}

const hashToken = (token: string): string => {
  const crypto = require('crypto')
  return crypto.createHash('sha256').update(token).digest('hex')
}
