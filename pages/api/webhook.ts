// pages/api/webhook.ts
import { NextApiRequest, NextApiResponse } from 'next'
import { supabase } from '@/utils/supabase'

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'nvzpix:nvzpix_secret_2025'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Método não permitido' })
  }

  const authHeader = req.headers['authorization']
  const basicPrefix = 'Basic '
  let receivedSecret: string | null = null

  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith(basicPrefix)) {
    const raw = authHeader.slice(basicPrefix.length)

    if (raw === WEBHOOK_SECRET) {
      receivedSecret = raw
    } else {
      try {
        const decoded = Buffer.from(raw, 'base64').toString('utf-8')
        const [username, password] = decoded.includes(':') ? decoded.split(':') : [null, decoded]
        receivedSecret = password ? `${username}:${password}` : decoded
      } catch {
        receivedSecret = raw
      }
    }
  }

  receivedSecret = receivedSecret ||
    req.headers['x-webhook-secret']?.toString() ||
    req.query.secret?.toString() ||
    req.body?.secret?.toString()

  if (receivedSecret !== WEBHOOK_SECRET) {
    return res.status(403).json({ error: 'Acesso negado. Secret inválido.' })
  }

  try {
    const { payerTaxNumber, valueInCents } = req.body

    if (!payerTaxNumber || !valueInCents) {
      return res.status(400).json({ message: 'Dados incompletos' })
    }

    const cpf = payerTaxNumber.toString().replace(/\D/g, '')

    const { data: usuario, error: erroUsuario } = await supabase
      .from('usuarios')
      .select('id')
      .eq('cpf', cpf)
      .single()

    if (erroUsuario || !usuario) {
      return res.status(404).json({ message: 'Usuário não encontrado' })
    }

    const valorReais = valueInCents / 100

    const { error: erroSaldo } = await supabase.from('saldo').insert([
      {
        usuario_id: usuario.id,
        valor: valorReais,
        tipo: 'deposito',
      },
    ])

    if (erroSaldo) {
      console.error('Erro ao inserir na tabela saldo:', erroSaldo)
      return res.status(500).json({ message: 'Erro ao registrar saldo' })
    }

    return res.status(200).json({ message: 'Depósito registrado com sucesso' })
  } catch (e) {
    console.error('Erro interno no webhook:', e)
    return res.status(500).json({ message: 'Erro interno' })
  }
}
