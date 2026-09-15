import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { getUserById } from '../modules/auth/auth.service'

const JWT_SECRET = process.env.JWT_SECRET!

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Token não fornecido' })
  }

  const token = authHeader.substring(7)

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string }
    const user = await getUserById(payload.sub)

    if (!user || !user.is_active) {
      return res.status(401).json({ success: false, error: 'Usuário inativo ou não encontrado' })
    }

    req.user = user
    next()
  } catch {
    return res.status(401).json({ success: false, error: 'Token inválido ou expirado' })
  }
}

// Middleware de verificação de plano
export const requirePlan = (plans: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !plans.includes(req.user.plan)) {
      return res.status(403).json({
        success: false,
        error: `Esta função requer plano: ${plans.join(' ou ')}`,
      })
    }
    next()
  }
}
