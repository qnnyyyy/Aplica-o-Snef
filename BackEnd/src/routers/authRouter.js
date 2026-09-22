const router = require('express').Router()
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const { transporter, logoAttachment } = require('../utils/mailer')
const { approveRegistration, rejectRegistration } = require('../services/registrationDecisions')

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

    // cadastro direto: só o Dono cria conta na hora, pois é ele quem cria a própria localidade.
    // Admin e Operador passam por /request-registration e precisam de aprovação.
    // Só serve pra quem AINDA não tem conta — quem já tem usa /register-owner-location,
    // que verifica a senha de verdade em vez de simplesmente reaproveitar o hash existente.
    router.post('/register', async (req, res) => {
        const { name, email, password, locationName, confirmationKey } = req.body

        if (!name || !email || !password || !locationName) {
            return res.status(400).json({ message: 'Dados inválidos' })
        }

        if (confirmationKey !== process.env.OWNER_REGISTRATION_KEY) {
            return res.status(403).json({ message: 'Chave de confirmação inválida' })
        }

        try {
            const [existingAccount] = await dbPromise.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email])

            if (existingAccount.length > 0) {
                return res.status(409).json({
                    message: 'Esse e-mail já tem conta no sistema. Use a aba "Já tenho conta" para criar uma nova localização.'
                })
            }

            const role = 'dono'
            const passwordHash = await bcrypt.hash(password, 10)

            // cada cadastro cria seu próprio tenant; quem cria vira dono dele
            const apiKey = crypto.randomBytes(20).toString('hex')
            const [tenantResult] = await dbPromise.query(
                'INSERT INTO tenants (name, api_key) VALUES (?, ?)',
                [locationName, apiKey]
            )
            const tenantId = tenantResult.insertId

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

    // pra quem já é dono (ou já tem qualquer conta) e quer criar mais uma localidade.
    // Verifica a senha de verdade pra evitar que alguém crie uma localidade "como" outra pessoa
    // só sabendo o e-mail dela e a chave de dono.
    router.post('/register-owner-location', async (req, res) => {
        const { email, password, locationName, confirmationKey } = req.body

        if (!email || !password || !locationName) {
            return res.status(400).json({ message: 'Dados inválidos' })
        }

        if (confirmationKey !== process.env.OWNER_REGISTRATION_KEY) {
            return res.status(403).json({ message: 'Chave de confirmação inválida' })
        }

        try {
            const [accounts] = await dbPromise.query('SELECT * FROM users WHERE email = ?', [email])

            if (accounts.length === 0) {
                return res.status(404).json({ message: 'Nenhuma conta encontrada com esse e-mail. Use a aba "Novo cadastro".' })
            }

            let verified = null
            for (const account of accounts) {
                if (await bcrypt.compare(password, account.password_hash)) {
                    verified = account
                    break
                }
            }

            if (!verified) {
                return res.status(401).json({ message: 'Senha incorreta' })
            }

            const apiKey = crypto.randomBytes(20).toString('hex')
            const [tenantResult] = await dbPromise.query(
                'INSERT INTO tenants (name, api_key) VALUES (?, ?)',
                [locationName, apiKey]
            )
            const tenantId = tenantResult.insertId

            const [result] = await dbPromise.query(
                "INSERT INTO users (name, email, password_hash, tenant_id, role) VALUES (?, ?, ?, ?, 'dono')",
                [verified.name, email, verified.password_hash, tenantId]
            )

            await dbPromise.query('UPDATE tenants SET owner_user_id = ? WHERE id = ?', [result.insertId, tenantId])

            issueLoginResponse(res, {
                id: result.insertId,
                name: verified.name,
                email,
                tenant_id: tenantId,
                role: 'dono'
            }, req, { skipAlert: true })
        } catch {
            res.status(500).json({ message: 'Erro ao criar localização' })
        }
    })

    router.get('/locations', async (req, res) => {
        try {
            const [rows] = await dbPromise.query('SELECT id, name FROM tenants ORDER BY name')
            res.json({ status: 'success', data: rows })
        } catch {
            res.status(500).json({ status: 'error', message: 'Erro ao buscar localizações' })
        }
    })

    async function notificarPendencia(tenantId, tenantName, { name, requestedRole, decisionToken, pendingId }) {
        try {
            const [recipients] = await dbPromise.query(
                "SELECT email FROM users WHERE tenant_id = ? AND role IN ('ADMIN', 'DONO') AND active = TRUE",
                [tenantId]
            )

            const roleLabel = requestedRole === 'admin' ? 'Admin' : 'Operador (Usuário)'
            const quando = new Date().toLocaleString('pt-BR')
            const linkBase = `${process.env.FRONT_URL}/api/auth/decide-registration?id=${pendingId}&token=${decisionToken}`

            for (const recipient of recipients) {
                transporter.sendMail({
                    from: process.env.MAIL_FROM,
                    to: recipient.email,
                    subject: 'Novo pedido de cadastro | SNEF',
                    html: `
                    <div style="background:#f4f2f8;padding:40px;font-family:Arial;text-align:center">
                        <div style="max-width:420px;background:#fff;border-radius:14px;padding:30px;margin:auto">
                            <img src="cid:snef-logo" alt="Groupe SNEF" style="max-width:140px;margin-bottom:20px">
                            <h2 style="color:#2b2142">Novo pedido de cadastro</h2>
                            <p><strong>${name}</strong> pediu acesso como <strong>${roleLabel}</strong> em <strong>${tenantName}</strong>, às <strong>${quando}</strong>.</p>
                            <div style="margin-top:20px">
                                <a href="${linkBase}&action=approve" style="display:inline-block;margin:0 6px;padding:14px 22px;background:#368D6D;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">
                                    ✅ Aprovar
                                </a>
                                <a href="${linkBase}&action=reject" style="display:inline-block;margin:0 6px;padding:14px 22px;background:#D9534F;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">
                                    ❌ Rejeitar
                                </a>
                            </div>
                            <p style="color:#888;font-size:12px;margin-top:20px">Esse link vale por 7 dias e some assim que alguém decidir — não precisa fazer nada se outro admin já resolver.</p>
                        </div>
                    </div>`,
                    attachments: [logoAttachment()]
                }).catch(err => console.error('Erro ao notificar pendência:', err.message))
            }
        } catch (err) {
            console.error('Erro ao buscar destinatários da pendência:', err.message)
        }
    }

    router.post('/request-registration', async (req, res) => {
        const { name, email, password, role, tenantId, confirmationKey, phone } = req.body

        if (!name || !email || !password || !role || !tenantId) {
            return res.status(400).json({ message: 'Dados inválidos' })
        }

        if (role !== 'admin' && role !== 'viewer') {
            return res.status(400).json({ message: 'Permissão inválida' })
        }

        if (role === 'admin' && confirmationKey !== process.env.REGISTRATION_KEY) {
            return res.status(403).json({ message: 'Chave de confirmação inválida' })
        }

        try {
            const [tenantRows] = await dbPromise.query('SELECT id, name FROM tenants WHERE id = ?', [tenantId])

            if (tenantRows.length === 0) {
                return res.status(404).json({ message: 'Localização não encontrada' })
            }

            // limite de 1 pedido por e-mail a cada 24h, pra não floodar o e-mail dos admins
            const [recent] = await dbPromise.query(
                'SELECT id FROM pending_registrations WHERE email = ? AND created_at >= NOW() - INTERVAL 1 DAY',
                [email]
            )

            if (recent.length > 0) {
                return res.status(429).json({ message: 'Você já enviou um cadastro hoje. Tente novamente amanhã.' })
            }

            const [existing] = await dbPromise.query(
                'SELECT id FROM users WHERE email = ? AND tenant_id = ?',
                [email, tenantId]
            )

            if (existing.length > 0) {
                return res.status(409).json({ message: 'Esse e-mail já tem acesso a essa localização' })
            }

            const passwordHash = await bcrypt.hash(password, 10)
            const decisionToken = crypto.randomBytes(24).toString('hex')
            const decisionTokenExpires = new Date(Date.now() + 7 * 24 * 3600000)

            const [result] = await dbPromise.query(
                'INSERT INTO pending_registrations (tenant_id, name, email, password_hash, requested_role, decision_token, decision_token_expires, phone_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [tenantId, name, email, passwordHash, role, decisionToken, decisionTokenExpires, role === 'viewer' ? (phone || null) : null]
            )

            notificarPendencia(tenantId, tenantRows[0].name, { name, requestedRole: role, decisionToken, pendingId: result.insertId })

            res.json({ status: 'success', message: 'Cadastro enviado! Aguarde a aprovação do responsável pela localização.' })
        } catch {
            res.status(500).json({ message: 'Erro ao enviar cadastro' })
        }
    })

    function paginaDecisao(titulo, mensagem, ok) {
        return `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>SNEF</title>
            <style>
                body { font-family: Arial, sans-serif; background: #F4F7F9; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; }
                .card { background: #fff; padding: 40px 30px; border-radius: 12px; max-width: 400px; text-align: center; box-shadow: 0 8px 25px rgba(0,0,0,0.12); }
                h2 { color: ${ok ? '#2b2142' : '#b3261e'}; margin-top: 0; }
                p { color: #555; line-height: 1.5; }
                a { color: #368D6D; font-weight: 600; text-decoration: none; }
            </style>
        </head>
        <body>
            <div class="card">
                <h2>${titulo}</h2>
                <p>${mensagem}</p>
                <p style="color:#999;font-size:13px">Pode fechar esta janela.</p>
            </div>
        </body>
        </html>`
    }

    // aprovar/rejeitar direto do link do e-mail, sem precisar logar.
    // o token é a própria autorização — some assim que alguém decide, então
    // se o mesmo e-mail chegar pra vários admins, só o primeiro clique vale.
    router.get('/decide-registration', async (req, res) => {
        const { id, token, action } = req.query

        if (!id || !token || !['approve', 'reject'].includes(action)) {
            return res.status(400).send(paginaDecisao('Link inválido', 'Esse link está incompleto ou incorreto.', false))
        }

        try {
            const [rows] = await dbPromise.query(
                'SELECT * FROM pending_registrations WHERE id = ? AND decision_token = ?',
                [id, token]
            )

            if (rows.length === 0) {
                return res.status(404).send(paginaDecisao('Link inválido', 'Esse link de aprovação não existe.', false))
            }

            const pending = rows[0]

            if (pending.status !== 'PENDING') {
                const jaFoi = pending.status === 'APPROVED' ? 'aprovado' : 'rejeitado'
                return res.send(paginaDecisao('Pedido já decidido', `O cadastro de ${pending.name} já tinha sido ${jaFoi} antes — provavelmente por outro admin.`, true))
            }

            if (new Date(pending.decision_token_expires) < new Date()) {
                return res.send(paginaDecisao('Link expirado', 'Esse link de aprovação expirou. Entre no sistema pra decidir manualmente, ou peça pra pessoa se cadastrar de novo.', false))
            }

            if (action === 'reject') {
                await rejectRegistration(dbPromise, pending, 'e-mail')
                return res.send(paginaDecisao('Cadastro rejeitado', `O pedido de ${pending.name} foi rejeitado.`, true))
            }

            const result = await approveRegistration(dbPromise, pending, 'e-mail')

            if (!result.ok) {
                return res.send(paginaDecisao('Não foi possível aprovar', result.message, false))
            }

            return res.send(paginaDecisao('Cadastro aprovado! 🎉', `${pending.name} agora tem acesso à localização.`, true))
        } catch (err) {
            res.status(500).send(paginaDecisao('Erro', 'Não foi possível processar esse pedido agora. Tente novamente mais tarde.', false))
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

    const LOGIN_MAX_ATTEMPTS = 5
    const LOGIN_WINDOW_MINUTES = 15

    async function registrarTentativaLogin(email, success, req) {
        const ip = (req.headers['x-forwarded-for'] || req.ip || '').replace('::ffff:', '')
        try {
            await dbPromise.query(
                'INSERT INTO login_attempts (email, success, ip) VALUES (?, ?, ?)',
                [email, success, ip || null]
            )
        } catch (err) {
            console.error('Erro ao registrar tentativa de login:', err.message)
        }
    }

    router.post('/login', async (req, res) => {
        const { email, password } = req.body

        try {
            const [recentFails] = await dbPromise.query(
                `SELECT COUNT(*) AS total FROM login_attempts
                 WHERE email = ? AND success = FALSE AND created_at >= NOW() - INTERVAL ${LOGIN_WINDOW_MINUTES} MINUTE`,
                [email]
            )

            if (recentFails[0].total >= LOGIN_MAX_ATTEMPTS) {
                return res.status(429).json({ message: `Muitas tentativas de login. Tente novamente em ${LOGIN_WINDOW_MINUTES} minutos.` })
            }

            const [users] = await dbPromise.query(
                'SELECT * FROM users WHERE email = ?',
                [email]
            )

            if (users.length === 0) {
                await registrarTentativaLogin(email, false, req)
                return res.status(401).json({ message: 'Credenciais inválidas' })
            }

            const matches = []
            for (const candidate of users) {
                if (await bcrypt.compare(password, candidate.password_hash)) {
                    matches.push(candidate)
                }
            }

            if (matches.length === 0) {
                await registrarTentativaLogin(email, false, req)
                return res.status(401).json({ message: 'Credenciais inválidas' })
            }

            await registrarTentativaLogin(email, true, req)

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
