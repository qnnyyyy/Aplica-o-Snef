const router = require('express').Router()
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const nodemailer = require('nodemailer')
const path = require('path')
const adminMiddleware = require('../adminMiddleware')

const LOGO_PATH = path.resolve(__dirname, '..', '..', '..', 'frontend', 'frontend', 'src', 'assets', 'snef_fr.jpg')

module.exports = (dbPromise) => {

    const transporter = nodemailer.createTransport({
        host: process.env.MAIL_HOST,
        port: process.env.MAIL_PORT,
        secure: false,
        auth: {
            user: process.env.MAIL_USER,
            pass: process.env.MAIL_PASS
        },
        tls: { rejectUnauthorized: false }
    })

    const simpleAuthMiddleware = (req, res, next) => {
        const authHeader = req.headers['authorization']
        const token = authHeader && authHeader.split(' ')[1]

        if (!token) {
            return res.status(401).json({ status: 'error', message: 'Token não fornecido.' })
        }

        try {
            const verified = jwt.verify(token, process.env.JWT_SECRET)
            req.user = verified
            req.tenantId = req.user.tenant_id || 1
            next()
        } catch {
            res.status(403).json({ status: 'error', message: 'Token inválido.' })
        }
    }

    // Lista os membros com acesso ao tenant do admin logado
    router.get('/', simpleAuthMiddleware, adminMiddleware, async (req, res) => {
        try {
            const [rows] = await dbPromise.query(
                'SELECT id, name, email, role, active, created_at FROM users WHERE tenant_id = ? ORDER BY role DESC, created_at',
                [req.tenantId]
            )
            res.json({ status: 'success', data: rows })
        } catch (err) {
            res.status(500).json({ status: 'error', message: 'Erro ao buscar membros' })
        }
    })

    // Convida um novo e-mail para ver os dados do tenant (sempre como "usuário", nunca admin)
    router.post('/invite', simpleAuthMiddleware, adminMiddleware, async (req, res) => {
        const { name, email } = req.body

        if (!name || !email) {
            return res.status(400).json({ status: 'error', message: 'Nome e e-mail são obrigatórios' })
        }

        try {
            const [exists] = await dbPromise.query('SELECT id FROM users WHERE email = ?', [email])

            if (exists.length > 0) {
                return res.status(409).json({ status: 'error', message: 'Esse e-mail já possui uma conta no sistema' })
            }

            // Senha inutilizável até a pessoa convidada definir a própria senha pelo link
            const placeholderHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10)

            const [result] = await dbPromise.query(
                "INSERT INTO users (name, email, password_hash, tenant_id, role) VALUES (?, ?, ?, ?, 'viewer')",
                [name, email, placeholderHash, req.tenantId]
            )

            const inviteToken = crypto.randomBytes(32).toString('hex')
            const expires = new Date(Date.now() + 48 * 3600000)

            await dbPromise.query(
                'UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?',
                [inviteToken, expires, result.insertId]
            )

            const inviteLink = `${process.env.FRONT_URL}/novasenha.html?token=${inviteToken}`

            await transporter.sendMail({
                from: process.env.MAIL_FROM,
                to: email,
                subject: 'Você foi convidado | SNEF',
                html: `
                <div style="background:#f4f2f8;padding:40px;font-family:Arial;text-align:center">
                    <div style="max-width:420px;background:#fff;border-radius:14px;padding:30px;margin:auto">
                        <img src="cid:snef-logo" alt="Groupe SNEF" style="max-width:140px;margin-bottom:20px">
                        <h2 style="color:#2b2142">Você foi convidado</h2>
                        <p>Olá ${name}, você foi convidado a acessar o sistema de monitoramento da SNEF. Clique no botão abaixo para criar sua senha e acessar.</p>
                        <a href="${inviteLink}" style="display:inline-block;margin-top:20px;padding:14px 24px;background:#008080;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">
                            Criar minha senha
                        </a>
                        <p style="font-size:12px;color:#999;margin-top:30px">Link válido por 48 horas</p>
                    </div>
                </div>`,
                attachments: [{
                    filename: 'snef_fr.jpg',
                    path: LOGO_PATH,
                    cid: 'snef-logo'
                }]
            })

            res.json({ status: 'success', message: 'Convite enviado com sucesso', data: { id: result.insertId } })
        } catch (err) {
            res.status(500).json({ status: 'error', message: 'Erro ao enviar convite' })
        }
    })

    // Remove o acesso de um membro do tenant (não permite remover a si mesmo)
    router.delete('/:id', simpleAuthMiddleware, adminMiddleware, async (req, res) => {
        const { id } = req.params

        if (Number(id) === req.user.id) {
            return res.status(400).json({ status: 'error', message: 'Você não pode remover a si mesmo' })
        }

        try {
            const [result] = await dbPromise.query(
                "DELETE FROM users WHERE id = ? AND tenant_id = ? AND role != 'admin'",
                [id, req.tenantId]
            )

            if (result.affectedRows === 0) {
                return res.status(404).json({ status: 'error', message: 'Usuário não encontrado' })
            }

            res.json({ status: 'success', message: 'Acesso removido' })
        } catch (err) {
            res.status(500).json({ status: 'error', message: 'Erro ao remover acesso' })
        }
    })

    return router
}
