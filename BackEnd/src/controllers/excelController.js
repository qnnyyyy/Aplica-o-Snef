const ExcelJS = require('exceljs')

router.get('/export/:id', async (req, res) => {
    const { id } = req.params

    try {
        const [[row]] = await dbPromise.query(`
            SELECT id, received_at, camera_id, raw_json
            FROM raw_payloads
            WHERE id = ?
        `, [id])

        if (!row) {
            return res.status(404).json({ error: 'Registro não encontrado' })
        }

        const workbook = new ExcelJS.Workbook()
        const sheet = workbook.addWorksheet('Relatório RAW')

        sheet.columns = [
            { header: 'Campo', key: 'field', width: 30 },
            { header: 'Valor', key: 'value', width: 60 }
        ]

        sheet.addRow({ field: 'ID', value: row.id })
        sheet.addRow({ field: 'Data/Hora', value: row.received_at })
        sheet.addRow({ field: 'Câmera', value: row.camera_id })

        Object.entries(row.raw_json).forEach(([key, value]) => {
            sheet.addRow({
                field: key,
                value: JSON.stringify(value)
            })
        })

        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        res.setHeader(
            'Content-Disposition',
            `attachment; filename=relatorio_raw_${row.id}.xlsx`
        )

        await workbook.xlsx.write(res)
        res.end()

    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Erro ao gerar Excel' })
    }
})
