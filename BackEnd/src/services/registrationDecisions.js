const { transporter, logoAttachment } = require('../utils/mailer')

async function registrarAuditoria(dbPromise, tenantId, actorEmail, action, targetEmail, details) {
    try {
        await dbPromise.query(
            'INSERT INTO audit_log (tenant_id, actor_email, action, target_email, details) VALUES (?, ?, ?, ?, ?)',
            [tenantId, actorEmail, action, targetEmail || null, details || null]
        )
    } catch (err) {
        console.error('Erro ao registrar auditoria:', err.message)
    }
}

async function approveRegistration(dbPromise, pending, decidedBy) {
    const [existing] = await dbPromise.query(
        'SELECT id FROM users WHERE email = ? AND tenant_id = ?',
        [pending.email, pending.tenant_id]
    )

    if (existing.length > 0) {
        await dbPromise.query(
            "UPDATE pending_registrations SET status = 'REJECTED', decided_at = NOW(), decided_by = ? WHERE id = ?",
            [decidedBy, pending.id]
        )
        return { ok: false, message: 'Esse e-mail já tem acesso a essa localização' }
    }

    // mantém a mesma senha do e-mail em outras localizações, se já existir uma
    const [otherAccount] = await dbPromise.query('SELECT password_hash FROM users WHERE email = ? LIMIT 1', [pending.email])
    const finalHash = otherAccount.length > 0 ? otherAccount[0].password_hash : pending.password_hash

    const [result] = await dbPromise.query(
        'INSERT INTO users (name, email, password_hash, tenant_id, role, phone_number) VALUES (?, ?, ?, ?, ?, ?)',
        [pending.name, pending.email, finalHash, pending.tenant_id, pending.requested_role, pending.phone_number || null]
    )

    await dbPromise.query(
        "UPDATE pending_registrations SET status = 'APPROVED', decided_at = NOW(), decided_by = ? WHERE id = ?",
        [decidedBy, pending.id]
    )

    await registrarAuditoria(
        dbPromise, pending.tenant_id, decidedBy, 'registration_approved',
        pending.email, `Aprovado como ${pending.requested_role.toLowerCase()}`
    )

    transporter.sendMail({
        from: process.env.MAIL_FROM,
        to: pending.email,
        subject: 'Seu cadastro foi aprovado | SNEF',
        html: `
        <div style="background:#f4f2f8;padding:40px;font-family:Arial;text-align:center">
            <div style="max-width:420px;background:#fff;border-radius:14px;padding:30px;margin:auto">
                <img src="cid:snef-logo" alt="Groupe SNEF" style="max-width:140px;margin-bottom:20px">
                <h2 style="color:#2b2142">Cadastro aprovado!</h2>
                <p>Olá ${pending.name}, seu acesso foi aprovado. Já pode entrar no sistema com o e-mail e senha que você cadastrou.</p>
                <a href="${process.env.FRONT_URL}/login.html" style="display:inline-block;margin-top:20px;padding:14px 24px;background:#008080;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">
                    Fazer login
                </a>
            </div>
        </div>`,
        attachments: [logoAttachment()]
    }).catch(err => console.error('Erro ao notificar aprovação:', err.message))

    return { ok: true, message: 'Cadastro aprovado', userId: result.insertId }
}

async function rejectRegistration(dbPromise, pending, decidedBy) {
    await dbPromise.query(
        "UPDATE pending_registrations SET status = 'REJECTED', decided_at = NOW(), decided_by = ? WHERE id = ?",
        [decidedBy, pending.id]
    )

    await registrarAuditoria(dbPromise, pending.tenant_id, decidedBy, 'registration_rejected', pending.email, null)

    return { ok: true, message: 'Cadastro rejeitado' }
}

module.exports = { approveRegistration, rejectRegistration }
