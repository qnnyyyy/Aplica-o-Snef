const cron = require('node-cron')
const { transporter, logoAttachment } = require('../utils/mailer')

function start(dbPromise) {
    cron.schedule('30 8 * * 1', async () => {
        try {
            await enviarRelatorioSemanal(dbPromise)
        } catch (err) {
            console.error('Erro no relatório semanal de câmeras:', err.message)
        }
    }, { timezone: 'America/Sao_Paulo' })
}

async function enviarRelatorioSemanal(dbPromise) {
    const [tenants] = await dbPromise.query('SELECT id, name FROM tenants')

    for (const tenant of tenants) {
        const [eventos] = await dbPromise.query(
            `SELECT camera_name, type, created_at
             FROM camera_alerts
             WHERE tenant_id = ? AND created_at >= NOW() - INTERVAL 7 DAY
             ORDER BY created_at DESC`,
            [tenant.id]
        )

        if (eventos.length === 0) continue

        const [destinatarios] = await dbPromise.query(
            "SELECT DISTINCT email, name FROM users WHERE tenant_id = ? AND (role IN ('ADMIN', 'DONO') OR is_maintenance = TRUE) AND active = TRUE",
            [tenant.id]
        )

        if (destinatarios.length === 0) continue

        const linhas = eventos.map(e => `
            <tr>
                <td style="padding:8px;border-bottom:1px solid #eee">${e.camera_name || 'Câmera'}</td>
                <td style="padding:8px;border-bottom:1px solid #eee">
                    <span style="color:${e.type === 'OFFLINE' ? '#b3261e' : '#1e7d34'};font-weight:bold">
                        ${e.type === 'OFFLINE' ? 'Caiu' : 'Voltou'}
                    </span>
                </td>
                <td style="padding:8px;border-bottom:1px solid #eee">${new Date(e.created_at).toLocaleString('pt-BR')}</td>
            </tr>
        `).join('')

        for (const destinatario of destinatarios) {
            transporter.sendMail({
                from: process.env.MAIL_FROM,
                to: destinatario.email,
                subject: `Atividade das câmeras da semana | ${tenant.name} | SNEF`,
                html: `
                <div style="background:#f4f2f8;padding:40px;font-family:Arial;text-align:center">
                    <div style="max-width:560px;background:#fff;border-radius:14px;padding:30px;margin:auto">
                        <img src="cid:snef-logo" alt="Groupe SNEF" style="max-width:140px;margin-bottom:20px">
                        <h2 style="color:#2b2142">Atividade das câmeras — ${tenant.name}</h2>
                        <p>Olá ${destinatario.name}, estas foram as quedas e recuperações de sinal nos últimos 7 dias:</p>
                        <table style="width:100%;border-collapse:collapse;text-align:left;font-size:13px">
                            <thead>
                                <tr>
                                    <th style="padding:8px;border-bottom:2px solid #368D6D">Câmera</th>
                                    <th style="padding:8px;border-bottom:2px solid #368D6D">Evento</th>
                                    <th style="padding:8px;border-bottom:2px solid #368D6D">Quando</th>
                                </tr>
                            </thead>
                            <tbody>${linhas}</tbody>
                        </table>
                    </div>
                </div>`,
                attachments: [logoAttachment()]
            }).catch(err => console.error('Erro ao enviar relatório semanal de câmeras:', err.message))
        }
    }
}

module.exports = { start }
