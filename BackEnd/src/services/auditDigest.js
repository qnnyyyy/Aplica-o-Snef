const cron = require('node-cron')
const { transporter, logoAttachment } = require('../utils/mailer')

const ACOES = {
    invite: 'Convite enviado',
    role_change: 'Permissão alterada',
    remove: 'Acesso removido',
    registration_approved: 'Cadastro aprovado',
    registration_rejected: 'Cadastro rejeitado'
}

function start(dbPromise) {
    cron.schedule('0 7 * * *', async () => {
        try {
            await enviarDigestoDiario(dbPromise)
        } catch (err) {
            console.error('Erro no digesto diário de auditoria:', err.message)
        }
    }, { timezone: 'America/Sao_Paulo' })
}

async function enviarDigestoDiario(dbPromise) {
    const [tenants] = await dbPromise.query('SELECT id, name FROM tenants')

    for (const tenant of tenants) {
        const [entradas] = await dbPromise.query(
            `SELECT actor_email, action, target_email, details, created_at
             FROM audit_log
             WHERE tenant_id = ? AND created_at >= NOW() - INTERVAL 1 DAY
             ORDER BY created_at DESC`,
            [tenant.id]
        )

        if (entradas.length === 0) continue

        const [destinatarios] = await dbPromise.query(
            "SELECT email, name FROM users WHERE tenant_id = ? AND role IN ('ADMIN', 'DONO') AND active = TRUE",
            [tenant.id]
        )

        if (destinatarios.length === 0) continue

        const linhas = entradas.map(e => `
            <tr>
                <td style="padding:8px;border-bottom:1px solid #eee">${new Date(e.created_at).toLocaleString('pt-BR')}</td>
                <td style="padding:8px;border-bottom:1px solid #eee">${e.actor_email}</td>
                <td style="padding:8px;border-bottom:1px solid #eee">${ACOES[e.action] || e.action}</td>
                <td style="padding:8px;border-bottom:1px solid #eee">${e.target_email || '-'}</td>
            </tr>
        `).join('')

        for (const destinatario of destinatarios) {
            transporter.sendMail({
                from: process.env.MAIL_FROM,
                to: destinatario.email,
                subject: `Resumo de atividades de ontem | ${tenant.name} | SNEF`,
                html: `
                <div style="background:#f4f2f8;padding:40px;font-family:Arial;text-align:center">
                    <div style="max-width:560px;background:#fff;border-radius:14px;padding:30px;margin:auto">
                        <img src="cid:snef-logo" alt="Groupe SNEF" style="max-width:140px;margin-bottom:20px">
                        <h2 style="color:#2b2142">Resumo de atividades — ${tenant.name}</h2>
                        <p>Olá ${destinatario.name}, estas foram as ações administrativas nas últimas 24 horas:</p>
                        <table style="width:100%;border-collapse:collapse;text-align:left;font-size:13px">
                            <thead>
                                <tr>
                                    <th style="padding:8px;border-bottom:2px solid #368D6D">Data</th>
                                    <th style="padding:8px;border-bottom:2px solid #368D6D">Quem fez</th>
                                    <th style="padding:8px;border-bottom:2px solid #368D6D">Ação</th>
                                    <th style="padding:8px;border-bottom:2px solid #368D6D">Alvo</th>
                                </tr>
                            </thead>
                            <tbody>${linhas}</tbody>
                        </table>
                    </div>
                </div>`,
                attachments: [logoAttachment()]
            }).catch(err => console.error('Erro ao enviar digesto de auditoria:', err.message))
        }
    }
}

module.exports = { start }
