const cron = require('node-cron')
const { transporter, logoAttachment } = require('../utils/mailer')

const OFFLINE_THRESHOLD_MINUTES = 15
const ALERT_COOLDOWN_HOURS = 6

function start(dbPromise) {
    cron.schedule('*/20 * * * *', async () => {
        try {
            // consulta leve que também mantém o banco ativo (evita power-off por inatividade em planos free)
            await dbPromise.query('SELECT 1')
            await verificarCamerasOffline(dbPromise)
        } catch (err) {
            console.error('Erro no monitor de câmeras:', err.message)
        }
    })
}

async function verificarCamerasOffline(dbPromise) {
    const [offline] = await dbPromise.query(`
        SELECT c.id, c.name, c.tenant_id, c.last_alert_sent_at, MAX(rp.received_at) as last_seen
        FROM cameras c
        LEFT JOIN raw_payloads rp ON rp.camera_id = c.id
        WHERE c.enabled = TRUE
        GROUP BY c.id, c.name, c.tenant_id, c.last_alert_sent_at
        HAVING last_seen IS NULL OR last_seen < NOW() - INTERVAL ${OFFLINE_THRESHOLD_MINUTES} MINUTE
    `)

    const paraAlertar = offline.filter(c =>
        !c.last_alert_sent_at || (Date.now() - new Date(c.last_alert_sent_at).getTime()) > ALERT_COOLDOWN_HOURS * 3600000
    )

    if (paraAlertar.length === 0) return

    const porTenant = new Map()
    paraAlertar.forEach(c => {
        if (!porTenant.has(c.tenant_id)) porTenant.set(c.tenant_id, [])
        porTenant.get(c.tenant_id).push(c)
    })

    for (const [tenantId, cameras] of porTenant) {
        const [admins] = await dbPromise.query(
            "SELECT email, name FROM users WHERE tenant_id = ? AND role = 'ADMIN' AND active = TRUE",
            [tenantId]
        )

        if (admins.length > 0) {
            await enviarAlertaOffline(admins, cameras)
        }

        await dbPromise.query(
            `UPDATE cameras SET last_alert_sent_at = NOW() WHERE id IN (${cameras.map(() => '?').join(',')})`,
            cameras.map(c => c.id)
        )
    }
}

async function enviarAlertaOffline(admins, cameras) {
    const lista = cameras.map(c => `<li>${c.name || `Câmera #${c.id}`}</li>`).join('')

    for (const admin of admins) {
        await transporter.sendMail({
            from: process.env.MAIL_FROM,
            to: admin.email,
            subject: 'Câmera(s) offline | SNEF',
            html: `
            <div style="background:#f4f2f8;padding:40px;font-family:Arial;text-align:center">
                <div style="max-width:420px;background:#fff;border-radius:14px;padding:30px;margin:auto">
                    <img src="cid:snef-logo" alt="Groupe SNEF" style="max-width:140px;margin-bottom:20px">
                    <h2 style="color:#b3261e">Câmera(s) sem sinal</h2>
                    <p>As câmeras abaixo não enviam dados há mais de ${OFFLINE_THRESHOLD_MINUTES} minutos:</p>
                    <ul style="text-align:left">${lista}</ul>
                </div>
            </div>`,
            attachments: [logoAttachment()]
        }).catch(err => console.error('Erro ao enviar alerta de câmera offline:', err.message))
    }
}

module.exports = { start }
