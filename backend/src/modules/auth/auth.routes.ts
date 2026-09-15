import { Router, Request, Response } from 'express'
import { z } from 'zod'
import * as authService from './auth.service'
import { authenticate } from '../../middleware/auth'
import { ApiResponse } from '../../types'

const router = Router()

const registerSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Senha deve ter ao menos 8 caracteres'),
  name: z.string().min(2).optional(),
  timezone: z.string().optional(),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

// POST /auth/register
router.post('/register', async (req: Request, res: Response) => {
  try {
    const dto = registerSchema.parse(req.body)
    const result = await authService.register(dto)
    res.status(201).json({ success: true, data: result } as ApiResponse)
  } catch (err: any) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ success: false, error: err.errors[0].message })
    }
    res.status(400).json({ success: false, error: err.message })
  }
})

// POST /auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const dto = loginSchema.parse(req.body)
    const result = await authService.login(dto)
    res.json({ success: true, data: result } as ApiResponse)
  } catch (err: any) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ success: false, error: err.errors[0].message })
    }
    res.status(401).json({ success: false, error: err.message })
  }
})

// POST /auth/refresh
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refresh_token } = req.body
    if (!refresh_token) {
      return res.status(400).json({ success: false, error: 'refresh_token obrigatório' })
    }
    const result = await authService.refreshAccessToken(refresh_token)
    res.json({ success: true, data: result } as ApiResponse)
  } catch (err: any) {
    res.status(401).json({ success: false, error: err.message })
  }
})

// GET /auth/me — rota protegida
router.get('/me', authenticate, async (req: Request, res: Response) => {
  res.json({ success: true, data: req.user } as ApiResponse)
})

// PUT /auth/preferences — rota protegida
router.put('/preferences', authenticate, async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      timezone: z.string().optional(),
      language: z.enum(['pt-BR', 'es', 'en']).optional(),
      name: z.string().min(2).optional(),
    })
    const prefs = schema.parse(req.body)
    await authService.updatePreferences(req.user!.id, prefs)
    res.json({ success: true, message: 'Preferências atualizadas' } as ApiResponse)
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message })
  }
})

// POST /auth/logout — rota protegida
router.post('/logout', authenticate, async (req: Request, res: Response) => {
  await authService.logout(req.user!.id)
  res.json({ success: true, message: 'Logout realizado' } as ApiResponse)
})

export default router
