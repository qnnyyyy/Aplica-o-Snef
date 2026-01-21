const router = require('express').Router()
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const nodemailer = require('nodemailer')

module.exports = function (dbPromise) {

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

    router.get('/me', simpleAuthMiddleware, async (req, res) => {
        try {
            const [rows] = await dbPromise.query(
                'SELECT name, email FROM users WHERE id = ?',
                [req.user.id]
            )
            if (rows.length === 0) {
                return res.status(404).json({ message: 'Usuário não encontrado' })
            }
            res.json({ status: 'success', data: rows[0] })
        } catch {
            res.status(500).json({ status: 'error', message: 'Erro interno' })
        }
    })

    router.put('/update', simpleAuthMiddleware, async (req, res) => {
        const { name, password } = req.body
        const userId = req.user.id

        try {
            if (password) {
                const passwordHash = await bcrypt.hash(password, 10)
                await dbPromise.query(
                    'UPDATE users SET name = ?, password_hash = ? WHERE id = ?',
                    [name, passwordHash, userId]
                )
            } else {
                await dbPromise.query(
                    'UPDATE users SET name = ? WHERE id = ?',
                    [name, userId]
                )
            }
            res.json({ status: 'success' })
        } catch {
            res.status(500).json({ status: 'error', message: 'Erro ao atualizar' })
        }
    })

    router.post('/register', async (req, res) => {
        const { name, email, password } = req.body

        if (!name || !email || !password) {
            return res.status(400).json({ message: 'Dados inválidos' })
        }

        try {
            const [exists] = await dbPromise.query(
                'SELECT id FROM users WHERE email = ?',
                [email]
            )

            if (exists.length > 0) {
                return res.status(409).json({ message: 'E-mail já cadastrado' })
            }

            const passwordHash = await bcrypt.hash(password, 10)
            const [result] = await dbPromise.query(
                'INSERT INTO users (name, email, password_hash, tenant_id, role) VALUES (?, ?, ?, 1, "viewer")',
                [name, email, passwordHash]
            )

            const token = jwt.sign(
                { id: result.insertId, email, tenant_id: 1, role: 'viewer' },
                process.env.JWT_SECRET,
                { expiresIn: '8h' }
            )

            res.json({
                status: 'success',
                token,
                user: { id: result.insertId, name, email }
            })
        } catch {
            res.status(500).json({ message: 'Erro ao cadastrar' })
        }
    })

    router.post('/login', async (req, res) => {
        const { email, password } = req.body

        try {
            const [users] = await dbPromise.query(
                'SELECT * FROM users WHERE email = ?',
                [email]
            )

            if (users.length === 0) {
                return res.status(401).json({ message: 'Credenciais inválidas' })
            }

            const user = users[0]
            const valid = await bcrypt.compare(password, user.password_hash)

            if (!valid) {
                return res.status(401).json({ message: 'Credenciais inválidas' })
            }

            const tenantId = user.tenant_id || 1
            const role = user.role || 'viewer'

            const token = jwt.sign(
                { id: user.id, email: user.email, tenant_id: tenantId, role },
                process.env.JWT_SECRET,
                { expiresIn: '8h' }
            )

            res.json({
                status: 'success',
                token,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    tenant_id: tenantId,
                    role
                }
            })
        } catch {
            res.status(500).json({ message: 'Erro no login' })
        }
    })

    router.post('/forgot-password', async (req, res) => {
        const { email } = req.body

        try {
            const [users] = await dbPromise.query(
                'SELECT id, name FROM users WHERE email = ?',
                [email]
            )

            if (users.length === 0) {
                return res.json({ status: 'success' })
            }

            const token = crypto.randomBytes(32).toString('hex')
            const expires = new Date(Date.now() + 3600000)

            await dbPromise.query(
                'UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?',
                [token, expires, users[0].id]
            )

            const resetLink = `${process.env.FRONT_URL}/novasenha.html?token=${token}`

            await transporter.sendMail({
                from: process.env.MAIL_FROM,
                to: email,
                subject: 'Redefinir senha | SNEF',
                html: `
                <div style="background:#f4f2f8;padding:40px;font-family:Arial;text-align:center">
                    <div style="max-width:420px;background:#fff;border-radius:14px;padding:30px;margin:auto">
                        <img src="https://SEU_DOMINIO/snef_fr.jpg" style="max-width:140px;margin-bottom:20px">
                        <h2 style="color:#2b2142">Redefinir senha</h2>
                        <p>Olá ${users[0].name}, clique no botão abaixo para criar uma nova senha.</p>
                        <a href="${resetLink}" style="display:inline-block;margin-top:20px;padding:14px 24px;background:#008080;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">
                            Criar nova senha
                        </a>
                        <p style="font-size:12px;color:#999;margin-top:30px">Link válido por 1 hora</p>
                    </div>
                </div>`
            })

            res.json({ status: 'success' })
        } catch {
            res.status(500).json({ status: 'error' })
        }
    })

    router.get('/validate-reset/:token', async (req, res) => {
        const { token } = req.params

        try {
            const [users] = await dbPromise.query(
                'SELECT id FROM users WHERE reset_token = ? AND reset_token_expires > NOW()',
                [token]
            )

            res.json({ valid: users.length > 0 })
        } catch {
            res.status(500).json({ valid: false })
        }
    })

    router.post('/reset-password/:token', async (req, res) => {
        const { token } = req.params
        const { password } = req.body

        try {
            const [users] = await dbPromise.query(
                'SELECT id FROM users WHERE reset_token = ? AND reset_token_expires > NOW()',
                [token]
            )

            if (users.length === 0) {
                return res.status(400).json({ message: 'Token inválido' })
            }

            const passwordHash = await bcrypt.hash(password, 10)

            await dbPromise.query(
                'UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?',
                [passwordHash, users[0].id]
            )

            res.json({ status: 'success' })
        } catch {
            res.status(500).json({ status: 'error' })
        }
    })

    return router
}
