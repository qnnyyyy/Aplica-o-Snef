const cron = require('node-cron')
const ExcelJS = require('exceljs')
const { transporter, logoAttachment } = require('../utils/mailer')

function start(dbPromise) {
    cron.schedule('0 8 * * 1', async () => {
        try {
            await enviarRelatoriosSemanais(dbPromise)
        } catch (err) {
            console.error('Erro no relatório agendado:', err.message)
        }
    }, { timezone: 'America/Sao_Paulo' })
}

async function enviarRelatoriosSemanais(dbPromise) {
    const [tenants] = await dbPromise.query('SELECT id, name FROM tenants')

    for (const tenant of tenants) {
        const [admins] = await dbPromise.query(
            "SELECT email, name FROM users WHERE tenant_id = ? AND role = 'ADMIN' AND active = TRUE",
            [tenant.id]
        )
        if (admins.length === 0) continue

        const [rows] = await dbPromise.query(`
            SELECT
                rp.received_at AS event_time,
                s.name AS station,
                c.name AS camera_friendly_name,
                IFNULL(z.name, 'Geral') AS zone,
                CAST(rp.raw_json->>'$.Data[0].CountingInfo[0].In' AS UNSIGNED) AS total_in,
                CAST(rp.raw_json->>'$.Data[0].CountingInfo[0].Out' AS UNSIGNED) AS total_out
            FROM raw_payloads rp
            INNER JOIN cameras c ON rp.camera_id = c.id AND c.tenant_id = ?
            LEFT JOIN zones z ON c.zone_id = z.id AND z.tenant_id = ?
            LEFT JOIN stations s ON z.station_id = s.id AND s.tenant_id = ?
            WHERE rp.tenant_id = ? AND rp.received_at >= NOW() - INTERVAL 7 DAY
            ORDER BY rp.received_at DESC
        `, [tenant.id, tenant.id, tenant.id, tenant.id])

        if (rows.length === 0) continue

        const buffer = await gerarExcel(rows)

        for (const admin of admins) {
            await transporter.sendMail({
                from: process.env.MAIL_FROM,
                to: admin.email,
                subject: `Relatório semanal | ${tenant.name} | SNEF`,
                html: `
                <div style="background:#f4f2f8;padding:40px;font-family:Arial;text-align:center">
                    <div style="max-width:420px;background:#fff;border-radius:14px;padding:30px;margin:auto">
                        <img src="cid:snef-logo" alt="Groupe SNEF" style="max-width:140px;margin-bottom:20px">
                        <h2 style="color:#2b2142">Relatório semanal — ${tenant.name}</h2>
                        <p>Segue em anexo o resumo de entradas e saídas dos últimos 7 dias.</p>
                    </div>
                </div>`,
                attachments: [
                    logoAttachment(),
                    {
                        filename: `SNEF_Relatorio_Semanal_${tenant.name}.xlsx`,
                        content: buffer,
                        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                    }
                ]
            }).catch(err => console.error('Erro ao enviar relatório semanal:', err.message))
        }
    }
}

async function gerarExcel(rows) {
    const wb = new ExcelJS.Workbook()
    wb.creator = 'SNEF'
    const ws = wb.addWorksheet('Relatório Semanal')

    ws.columns = [
        { header: 'Data/Hora', key: 'dataHora', width: 20 },
        { header: 'Estação', key: 'estacao', width: 18 },
        { header: 'Câmera', key: 'camera', width: 26 },
        { header: 'Zona', key: 'zona', width: 18 },
        { header: 'Entradas', key: 'entradas', width: 12 },
        { header: 'Saídas', key: 'saidas', width: 12 }
    ]

    ws.getRow(1).eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF368D6D' } }
        cell.alignment = { vertical: 'middle', horizontal: 'center' }
    })

    let somaIn = 0, somaOut = 0

    rows.forEach(row => {
        const valIn = parseInt(row.total_in) || 0
        const valOut = parseInt(row.total_out) || 0
        somaIn += valIn
        somaOut += valOut

        ws.addRow({
            dataHora: new Date(row.event_time).toLocaleString('pt-BR'),
            estacao: row.station || 'N/A',
            camera: row.camera_friendly_name,
            zona: row.zone,
            entradas: valIn,
            saidas: valOut
        })
    })

    const totalRow = ws.addRow({ dataHora: '', estacao: '', camera: '', zona: 'TOTAL', entradas: somaIn, saidas: somaOut })
    totalRow.eachCell(cell => { cell.font = { bold: true } })

    return wb.xlsx.writeBuffer()
}

module.exports = { start }
