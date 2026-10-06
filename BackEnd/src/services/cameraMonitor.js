const cron = require('node-cron')
const { transporter, logoAttachment } = require('../utils/mailer')

const OFFLINE_THRESHOLD_MINUTES = 15
const ALERT_COOLDOWN_HOURS = 6
const CAPACITY_COOLDOWN_HOURS = 2

function start(dbPromise) {
    cron.schedule('*/20 * * * *', async () => {
        try {
            // o SELECT 1 também evita que o banco do plano free desligue por inatividade
            await dbPromise.query('SELECT 1')
            await verificarCamerasOffline(dbPromise)
            await verificarSuperlotacao(dbPromise)
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
            "SELECT email, name FROM users WHERE tenant_id = ? AND role IN ('ADMIN', 'DONO') AND active = TRUE",
            [tenantId]
        )

        if (admins.length > 0) {
            await enviarAlertaOffline(admins, cameras)
        }

        for (const camera of cameras) {
            await dbPromise.query(
                'INSERT INTO camera_alerts (tenant_id, camera_id, camera_name, type) VALUES (?, ?, ?, ?)',
                [tenantId, camera.id, camera.name || `Câmera #${camera.id}`, 'OFFLINE']
            )
        }

        await dbPromise.query(
            `UPDATE cameras SET last_alert_sent_at = NOW() WHERE id IN (${cameras.map(() => '?').join(',')})`,
            cameras.map(c => c.id)
        )
    }
}

async function verificarSuperlotacao(dbPromise) {
    const [tenants] = await dbPromise.query(`
        SELECT id, name, capacity_alert_threshold, capacity_alert_sent_at
        FROM tenants
        WHERE capacity_alert_threshold IS NOT NULL
    `)

    for (const tenant of tenants) {
        const [totais] = await dbPromise.query(`
            SELECT
                IFNULL(SUM(CAST(raw_json->>'$.Data[0].CountingInfo[0].In' AS UNSIGNED)), 0) AS totalIn,
                IFNULL(SUM(CAST(raw_json->>'$.Data[0].CountingInfo[0].Out' AS UNSIGNED)), 0) AS totalOut
            FROM raw_payloads
            WHERE DATE(received_at) = CURDATE() AND tenant_id = ?
        `, [tenant.id])

        const ocupacao = Math.max(0, (totais[0].totalIn || 0) - (totais[0].totalOut || 0))

        if (ocupacao <= tenant.capacity_alert_threshold) {
            if (tenant.capacity_alert_sent_at) {
                await dbPromise.query('UPDATE tenants SET capacity_alert_sent_at = NULL WHERE id = ?', [tenant.id])
            }
            continue
        }

        const emCooldown = tenant.capacity_alert_sent_at &&
            (Date.now() - new Date(tenant.capacity_alert_sent_at).getTime()) < CAPACITY_COOLDOWN_HOURS * 3600000

        if (emCooldown) continue

        const [admins] = await dbPromise.query(
            "SELECT email, name FROM users WHERE tenant_id = ? AND role IN ('ADMIN', 'DONO') AND active = TRUE",
            [tenant.id]
        )

        for (const admin of admins) {
            transporter.sendMail({
                from: process.env.MAIL_FROM,
                to: admin.email,
                subject: `Superlotação | ${tenant.name} | SNEF`,
                html: `
                <div style="background:#f4f2f8;padding:40px;font-family:Arial;text-align:center">
                    <div style="max-width:420px;background:#fff;border-radius:14px;padding:30px;margin:auto">
                        <img src="cid:snef-logo" alt="Groupe SNEF" style="max-width:140px;margin-bottom:20px">
                        <h2 style="color:#b3261e">Limite de ocupação ultrapassado</h2>
                        <p><strong>${tenant.name}</strong> está com <strong>${ocupacao}</strong> pessoas no local agora, acima do limite configurado de ${tenant.capacity_alert_threshold}.</p>
                    </div>
                </div>`,
                attachments: [logoAttachment()]
            }).catch(err => console.error('Erro ao enviar alerta de superlotação:', err.message))
        }

        await dbPromise.query('UPDATE tenants SET capacity_alert_sent_at = NOW() WHERE id = ?', [tenant.id])
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
