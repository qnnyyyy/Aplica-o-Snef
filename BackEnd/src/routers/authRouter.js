const router = require('express').Router()
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const nodemailer = require('nodemailer')
const path = require('path')

const LOGO_PATH = path.resolve(__dirname, '..', '..', '..', 'frontend', 'frontend', 'src', 'assets', 'snef_fr.jpg')

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
                'SELECT name, email, role FROM users WHERE id = ?',
                [req.user.id]
            )
            if (rows.length === 0) {
                return res.status(404).json({ message: 'Usuário não encontrado' })
            }
            res.json({
                status: 'success',
                data: { ...rows[0], role: (rows[0].role || 'viewer').toLowerCase() }
            })
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
            // Cada cadastro novo ganha seu próprio tenant (dados isolados), e
            // quem cria a conta é o admin desse tenant. O mesmo e-mail pode
            // existir em outro tenant (ex: convidado como viewer em outro
            // lugar); a unicidade real é (email, tenant_id).
            const [tenantResult] = await dbPromise.query(
                'INSERT INTO tenants (name) VALUES (?)',
                [`Workspace de ${name}`]
            )
            const tenantId = tenantResult.insertId

            const passwordHash = await bcrypt.hash(password, 10)
            const [result] = await dbPromise.query(
                "INSERT INTO users (name, email, password_hash, tenant_id, role) VALUES (?, ?, ?, ?, 'admin')",
                [name, email, passwordHash, tenantId]
            )

            const token = jwt.sign(
                { id: result.insertId, email, tenant_id: tenantId, role: 'admin' },
                process.env.JWT_SECRET,
                { expiresIn: '8h' }
            )

            res.json({
                status: 'success',
                token,
                user: { id: result.insertId, name, email, tenant_id: tenantId, role: 'admin' }
            })
        } catch {
            res.status(500).json({ message: 'Erro ao cadastrar' })
        }
    })

    function issueLoginResponse(res, user) {
        const tenantId = user.tenant_id || 1
        const role = (user.role || 'viewer').toLowerCase()

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
    }

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

            const matches = []
            for (const candidate of users) {
                if (await bcrypt.compare(password, candidate.password_hash)) {
                    matches.push(candidate)
                }
            }

            if (matches.length === 0) {
                return res.status(401).json({ message: 'Credenciais inválidas' })
            }

            // E-mail único casa com uma única conta: login direto.
            if (matches.length === 1) {
                return issueLoginResponse(res, matches[0])
            }

            // Mesmo e-mail/senha válidos em mais de uma conta (ex: admin em um
            // tenant e usuário convidado em outro): pede pra escolher qual.
            const tenantIds = [...new Set(matches.map(m => m.tenant_id))]
            const [tenants] = await dbPromise.query(
                `SELECT id, name FROM tenants WHERE id IN (${tenantIds.map(() => '?').join(',')})`,
                tenantIds
            )
            const tenantNameById = Object.fromEntries(tenants.map(t => [t.id, t.name]))

            const selectionToken = jwt.sign(
                { purpose: 'select-account', accountIds: matches.map(m => m.id) },
                process.env.JWT_SECRET,
                { expiresIn: '5m' }
            )

            res.json({
                status: 'select_account',
                selectionToken,
                accounts: matches.map(m => ({
                    id: m.id,
                    role: (m.role || 'viewer').toLowerCase(),
                    tenant_name: tenantNameById[m.tenant_id] || 'Workspace'
                }))
            })
        } catch {
            res.status(500).json({ message: 'Erro no login' })
        }
    })

    // Segunda etapa do login quando o e-mail/senha bate com mais de uma conta
    router.post('/login/select', async (req, res) => {
        const { selectionToken, accountId } = req.body

        try {
            const decoded = jwt.verify(selectionToken, process.env.JWT_SECRET)

            if (decoded.purpose !== 'select-account' || !decoded.accountIds.includes(Number(accountId))) {
                return res.status(403).json({ message: 'Seleção inválida' })
            }

            const [users] = await dbPromise.query('SELECT * FROM users WHERE id = ?', [accountId])

            if (users.length === 0) {
                return res.status(404).json({ message: 'Conta não encontrada' })
            }

            issueLoginResponse(res, users[0])
        } catch {
            res.status(403).json({ message: 'Seleção expirada, faça login novamente' })
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

            // O mesmo e-mail pode ter mais de uma conta (tenants diferentes);
            // o mesmo token vale pra todas, evitando ambiguidade sobre qual delas.
            await dbPromise.query(
                'UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE email = ?',
                [token, expires, email]
            )

            const resetLink = `${process.env.FRONT_URL}/novasenha.html?token=${token}`

            await transporter.sendMail({
                from: process.env.MAIL_FROM,
                to: email,
                subject: 'Redefinir senha | SNEF',
                html: `
                <div style="background:#f4f2f8;padding:40px;font-family:Arial;text-align:center">
                    <div style="max-width:420px;background:#fff;border-radius:14px;padding:30px;margin:auto">
                        <img src="cid:snef-logo" alt="Groupe SNEF" style="max-width:140px;margin-bottom:20px">
                        <h2 style="color:#2b2142">Redefinir senha</h2>
                        <p>Olá ${users[0].name}, clique no botão abaixo para criar uma nova senha.</p>
                        <a href="${resetLink}" style="display:inline-block;margin-top:20px;padding:14px 24px;background:#008080;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">
                            Criar nova senha
                        </a>
                        <p style="font-size:12px;color:#999;margin-top:30px">Link válido por 1 hora</p>
                    </div>
                </div>`,
                attachments: [{
                    filename: 'snef_fr.jpg',
                    path: LOGO_PATH,
                    cid: 'snef-logo'
                }]
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

            // Aplica em todas as contas que compartilham esse token (mesmo
            // e-mail em tenants diferentes recebem a mesma nova senha).
            await dbPromise.query(
                'UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE reset_token = ?',
                [passwordHash, token]
            )

            res.json({ status: 'success' })
        } catch {
            res.status(500).json({ status: 'error' })
        }
    })

    return router
}
