const router = require('express').Router()
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const adminMiddleware = require('../adminMiddleware')
const { transporter, logoAttachment } = require('../utils/mailer')
const { approveRegistration, rejectRegistration } = require('../services/registrationDecisions')

module.exports = (dbPromise) => {

    async function registrarAuditoria(req, action, targetEmail, details) {
        try {
            await dbPromise.query(
                'INSERT INTO audit_log (tenant_id, actor_email, action, target_email, details) VALUES (?, ?, ?, ?, ?)',
                [req.tenantId, req.user.email, action, targetEmail || null, details || null]
            )
        } catch (err) {
            console.error('Erro ao registrar auditoria:', err.message)
        }
    }

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

    router.get('/', simpleAuthMiddleware, adminMiddleware, async (req, res) => {
        try {
            const [rows] = await dbPromise.query(
                `SELECT u.id, u.name, u.email, u.role, u.active, u.created_at,
                        (u.id = t.owner_user_id) AS is_owner
                 FROM users u
                 JOIN tenants t ON t.id = u.tenant_id
                 WHERE u.tenant_id = ?
                 ORDER BY is_owner DESC, u.role DESC, u.created_at`,
                [req.tenantId]
            )
            res.json({ status: 'success', data: rows })
        } catch (err) {
            res.status(500).json({ status: 'error', message: 'Erro ao buscar membros' })
        }
    })

    router.get('/audit-log', simpleAuthMiddleware, adminMiddleware, async (req, res) => {
        try {
            const [rows] = await dbPromise.query(
                'SELECT actor_email, action, target_email, details, created_at FROM audit_log WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 100',
                [req.tenantId]
            )
            res.json({ status: 'success', data: rows })
        } catch (err) {
            res.status(500).json({ status: 'error', message: 'Erro ao buscar log de auditoria' })
        }
    })

    router.post('/invite', simpleAuthMiddleware, adminMiddleware, async (req, res) => {
        const { name, email, role, confirmationKey } = req.body
        const grantAdmin = role === 'admin'

        if (!name || !email) {
            return res.status(400).json({ status: 'error', message: 'Nome e e-mail são obrigatórios' })
        }

        if (confirmationKey !== process.env.REGISTRATION_KEY) {
            return res.status(403).json({ status: 'error', message: 'Chave de confirmação inválida' })
        }

        try {
            const [exists] = await dbPromise.query(
                'SELECT id FROM users WHERE email = ? AND tenant_id = ?',
                [email, req.tenantId]
            )

            if (exists.length > 0) {
                return res.status(409).json({ status: 'error', message: 'Esse e-mail já tem acesso a este tenant' })
            }

            // senha temporária inutilizável até a pessoa definir a própria pelo link
            const placeholderHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10)

            const [result] = await dbPromise.query(
                'INSERT INTO users (name, email, password_hash, tenant_id, role) VALUES (?, ?, ?, ?, ?)',
                [name, email, placeholderHash, req.tenantId, grantAdmin ? 'admin' : 'viewer']
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
                attachments: [logoAttachment()]
            })

            await registrarAuditoria(req, 'invite', email, `Convidado como ${grantAdmin ? 'admin' : 'usuário'}`)

            res.json({ status: 'success', message: 'Convite enviado com sucesso', data: { id: result.insertId } })
        } catch (err) {
            res.status(500).json({ status: 'error', message: 'Erro ao enviar convite' })
        }
    })

    router.put('/:id/role', simpleAuthMiddleware, adminMiddleware, async (req, res) => {
        const { id } = req.params
        const { role, confirmationKey } = req.body

        if (role !== 'admin' && role !== 'viewer') {
            return res.status(400).json({ status: 'error', message: 'Permissão inválida' })
        }

        if (Number(id) === req.user.id) {
            return res.status(400).json({ status: 'error', message: 'Você não pode alterar sua própria permissão' })
        }

        if (confirmationKey !== process.env.REGISTRATION_KEY) {
            return res.status(403).json({ status: 'error', message: 'Chave de confirmação inválida' })
        }

        try {
            const [tenantRows] = await dbPromise.query('SELECT owner_user_id FROM tenants WHERE id = ?', [req.tenantId])

            if (tenantRows.length > 0 && Number(tenantRows[0].owner_user_id) === Number(id)) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Esse é o admin principal desta localidade — a permissão dele não pode ser alterada pelo sistema.'
                })
            }

            const [targetRows] = await dbPromise.query('SELECT email FROM users WHERE id = ? AND tenant_id = ?', [id, req.tenantId])

            const [result] = await dbPromise.query(
                'UPDATE users SET role = ? WHERE id = ? AND tenant_id = ?',
                [role, id, req.tenantId]
            )

            if (result.affectedRows === 0) {
                return res.status(404).json({ status: 'error', message: 'Usuário não encontrado' })
            }

            await registrarAuditoria(req, 'role_change', targetRows[0]?.email, `Nova permissão: ${role}`)

            res.json({ status: 'success', message: 'Permissão atualizada' })
        } catch (err) {
            res.status(500).json({ status: 'error', message: 'Erro ao atualizar permissão' })
        }
    })

    router.delete('/:id', simpleAuthMiddleware, adminMiddleware, async (req, res) => {
        const { id } = req.params

        if (Number(id) === req.user.id) {
            return res.status(400).json({ status: 'error', message: 'Você não pode remover a si mesmo' })
        }

        try {
            const [targetRows] = await dbPromise.query('SELECT email FROM users WHERE id = ? AND tenant_id = ?', [id, req.tenantId])

            const [result] = await dbPromise.query(
                "DELETE FROM users WHERE id = ? AND tenant_id = ? AND role NOT IN ('admin', 'dono')",
                [id, req.tenantId]
            )

            if (result.affectedRows === 0) {
                return res.status(404).json({ status: 'error', message: 'Usuário não encontrado' })
            }

            await registrarAuditoria(req, 'remove', targetRows[0]?.email, null)

            res.json({ status: 'success', message: 'Acesso removido' })
        } catch (err) {
            res.status(500).json({ status: 'error', message: 'Erro ao remover acesso' })
        }
    })

    router.get('/pending-registrations', simpleAuthMiddleware, adminMiddleware, async (req, res) => {
        try {
            const [rows] = await dbPromise.query(
                "SELECT id, name, email, requested_role, created_at FROM pending_registrations WHERE tenant_id = ? AND status = 'PENDING' ORDER BY created_at",
                [req.tenantId]
            )
            res.json({ status: 'success', data: rows })
        } catch (err) {
            res.status(500).json({ status: 'error', message: 'Erro ao buscar cadastros pendentes' })
        }
    })

    router.post('/pending-registrations/:id/approve', simpleAuthMiddleware, adminMiddleware, async (req, res) => {
        const { id } = req.params

        try {
            const [rows] = await dbPromise.query(
                "SELECT * FROM pending_registrations WHERE id = ? AND tenant_id = ? AND status = 'PENDING'",
                [id, req.tenantId]
            )

            if (rows.length === 0) {
                return res.status(404).json({ status: 'error', message: 'Pedido não encontrado' })
            }

            const result = await approveRegistration(dbPromise, rows[0], req.user.email)

            if (!result.ok) {
                return res.status(409).json({ status: 'error', message: result.message })
            }

            res.json({ status: 'success', message: result.message, data: { id: result.userId } })
        } catch (err) {
            res.status(500).json({ status: 'error', message: 'Erro ao aprovar cadastro' })
        }
    })

    router.post('/pending-registrations/:id/reject', simpleAuthMiddleware, adminMiddleware, async (req, res) => {
        const { id } = req.params

        try {
            const [rows] = await dbPromise.query(
                "SELECT * FROM pending_registrations WHERE id = ? AND tenant_id = ? AND status = 'PENDING'",
                [id, req.tenantId]
            )

            if (rows.length === 0) {
                return res.status(404).json({ status: 'error', message: 'Pedido não encontrado' })
            }

            await rejectRegistration(dbPromise, rows[0], req.user.email)

            res.json({ status: 'success', message: 'Cadastro rejeitado' })
        } catch (err) {
            res.status(500).json({ status: 'error', message: 'Erro ao rejeitar cadastro' })
        }
    })

    return router
}
