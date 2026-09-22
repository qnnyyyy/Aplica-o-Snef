const router = require('express').Router()
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const { transporter, logoAttachment } = require('../utils/mailer')

module.exports = function (dbPromise) {

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
        const userEmail = req.user.email

        try {
            await dbPromise.query('UPDATE users SET name = ? WHERE id = ?', [name, userId])

            if (password) {
                const passwordHash = await bcrypt.hash(password, 10)
                // aplica em todas as contas desse e-mail, não só na atual
                await dbPromise.query(
                    'UPDATE users SET password_hash = ? WHERE email = ?',
                    [passwordHash, userEmail]
                )
            }

            res.json({ status: 'success' })
        } catch {
            res.status(500).json({ status: 'error', message: 'Erro ao atualizar' })
        }
    })

    router.post('/register', async (req, res) => {
        const { name, email, password, locationName, confirmationKey, accountType } = req.body

        if (!name || !email || !password || !locationName) {
            return res.status(400).json({ message: 'Dados inválidos' })
        }

        const isOwnerAccount = accountType === 'owner'
        const expectedKey = isOwnerAccount ? process.env.OWNER_REGISTRATION_KEY : process.env.REGISTRATION_KEY

        if (confirmationKey !== expectedKey) {
            return res.status(403).json({ message: 'Chave de confirmação inválida' })
        }

        const role = isOwnerAccount ? 'dono' : 'admin'

        try {
            // cada cadastro cria seu próprio tenant; quem cria vira admin (ou dono) dele
            const apiKey = crypto.randomBytes(20).toString('hex')
            const [tenantResult] = await dbPromise.query(
                'INSERT INTO tenants (name, api_key) VALUES (?, ?)',
                [locationName, apiKey]
            )
            const tenantId = tenantResult.insertId

            // se o e-mail já existe em outro tenant, mantém a senha atual dele
            const [existingAccount] = await dbPromise.query(
                'SELECT password_hash FROM users WHERE email = ? LIMIT 1',
                [email]
            )
            const passwordHash = existingAccount.length > 0
                ? existingAccount[0].password_hash
                : await bcrypt.hash(password, 10)

            const [result] = await dbPromise.query(
                'INSERT INTO users (name, email, password_hash, tenant_id, role) VALUES (?, ?, ?, ?, ?)',
                [name, email, passwordHash, tenantId, role]
            )

            // dono do tenant: nenhum outro admin pode alterar a permissão dele
            await dbPromise.query(
                'UPDATE tenants SET owner_user_id = ? WHERE id = ?',
                [result.insertId, tenantId]
            )

            const token = jwt.sign(
                { id: result.insertId, email, tenant_id: tenantId, role },
                process.env.JWT_SECRET,
                { expiresIn: '8h' }
            )

            res.json({
                status: 'success',
                token,
                user: { id: result.insertId, name, email, tenant_id: tenantId, role }
            })
        } catch {
            res.status(500).json({ message: 'Erro ao cadastrar' })
        }
    })

    router.post('/create-location', simpleAuthMiddleware, async (req, res) => {
        const { locationName } = req.body

        if ((req.user.role || '').toLowerCase() !== 'dono') {
            return res.status(403).json({ status: 'error', message: 'Apenas o Dono pode criar novas localizações' })
        }

        if (!locationName || !locationName.trim()) {
            return res.status(400).json({ status: 'error', message: 'Nome da localização é obrigatório' })
        }

        try {
            const [currentRows] = await dbPromise.query('SELECT name, password_hash FROM users WHERE id = ?', [req.user.id])

            if (currentRows.length === 0) {
                return res.status(404).json({ status: 'error', message: 'Usuário não encontrado' })
            }

            const apiKey = crypto.randomBytes(20).toString('hex')
            const [tenantResult] = await dbPromise.query(
                'INSERT INTO tenants (name, api_key) VALUES (?, ?)',
                [locationName.trim(), apiKey]
            )
            const tenantId = tenantResult.insertId

            const [result] = await dbPromise.query(
                "INSERT INTO users (name, email, password_hash, tenant_id, role) VALUES (?, ?, ?, ?, 'dono')",
                [currentRows[0].name, req.user.email, currentRows[0].password_hash, tenantId]
            )

            await dbPromise.query('UPDATE tenants SET owner_user_id = ? WHERE id = ?', [result.insertId, tenantId])

            issueLoginResponse(res, {
                id: result.insertId,
                name: currentRows[0].name,
                email: req.user.email,
                tenant_id: tenantId,
                role: 'dono'
            }, req, { skipAlert: true })
        } catch (err) {
            res.status(500).json({ status: 'error', message: 'Erro ao criar localização' })
        }
    })

    router.get('/my-accounts', simpleAuthMiddleware, async (req, res) => {
        try {
            const [rows] = await dbPromise.query(
                `SELECT u.id, u.role, t.name AS tenant_name
                 FROM users u
                 JOIN tenants t ON t.id = u.tenant_id
                 WHERE u.email = ?
                 ORDER BY t.name`,
                [req.user.email]
            )

            res.json({
                status: 'success',
                data: rows.map(r => ({
                    id: r.id,
                    role: (r.role || 'viewer').toLowerCase(),
                    tenant_name: r.tenant_name,
                    current: r.id === req.user.id
                }))
            })
        } catch (err) {
            res.status(500).json({ status: 'error', message: 'Erro ao buscar localizações' })
        }
    })

    router.post('/switch', simpleAuthMiddleware, async (req, res) => {
        const { accountId } = req.body

        try {
            const [rows] = await dbPromise.query('SELECT * FROM users WHERE id = ? AND email = ?', [accountId, req.user.email])

            if (rows.length === 0) {
                return res.status(403).json({ status: 'error', message: 'Essa conta não pertence a esse e-mail' })
            }

            issueLoginResponse(res, rows[0], req, { skipAlert: true })
        } catch (err) {
            res.status(500).json({ status: 'error', message: 'Erro ao trocar de localização' })
        }
    })

    function enviarAlertaLogin(user, req) {
        const ip = (req.headers['x-forwarded-for'] || req.ip || '').replace('::ffff:', '')
        const quando = new Date().toLocaleString('pt-BR')

        transporter.sendMail({
            from: process.env.MAIL_FROM,
            to: user.email,
            subject: 'Novo acesso à sua conta | SNEF',
            html: `
            <div style="background:#f4f2f8;padding:40px;font-family:Arial;text-align:center">
                <div style="max-width:420px;background:#fff;border-radius:14px;padding:30px;margin:auto">
                    <img src="cid:snef-logo" alt="Groupe SNEF" style="max-width:140px;margin-bottom:20px">
                    <h2 style="color:#2b2142">Novo acesso detectado</h2>
                    <p>Olá ${user.name}, sua conta SNEF acabou de ser acessada em <strong>${quando}</strong>${ip ? ` a partir do IP <strong>${ip}</strong>` : ''}.</p>
                    <p style="color:#888;font-size:13px">Se não foi você, altere sua senha imediatamente.</p>
                </div>
            </div>`,
            attachments: [logoAttachment()]
        }).catch(err => console.error('Erro ao enviar alerta de login:', err.message))
    }

    function issueLoginResponse(res, user, req, options = {}) {
        const tenantId = user.tenant_id || 1
        const role = (user.role || 'viewer').toLowerCase()

        const token = jwt.sign(
            { id: user.id, email: user.email, tenant_id: tenantId, role },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        )

        if (!options.skipAlert) {
            enviarAlertaLogin(user, req)
        }

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

            if (matches.length === 1) {
                return issueLoginResponse(res, matches[0], req)
            }

            // senha válida em mais de uma conta: pede pra escolher o tenant
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

            issueLoginResponse(res, users[0], req)
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

            // vale pra todas as contas desse e-mail, não só a primeira
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
                attachments: [logoAttachment()]
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
                'SELECT id, email FROM users WHERE reset_token = ? AND reset_token_expires > NOW()',
                [token]
            )

            if (users.length === 0) {
                return res.status(400).json({ message: 'Token inválido' })
            }

            const passwordHash = await bcrypt.hash(password, 10)

            // sincroniza em todas as contas desse e-mail, não só a do token
            await dbPromise.query(
                'UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE email = ?',
                [passwordHash, users[0].email]
            )

            res.json({ status: 'success' })
        } catch {
            res.status(500).json({ status: 'error' })
        }
    })

    return router
}
