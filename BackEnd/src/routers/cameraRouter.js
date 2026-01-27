const express = require('express')
const router = express.Router()
const tenantMiddleware = require('../tenantMiddleware')

module.exports = (db) => {

    router.get('/', tenantMiddleware, async (req, res) => {
        try {
            const [rows] = await db.query(`
                SELECT 
                    c.id, 
                    c.camera_id, 
                    c.name, 
                    c.model, 
                    c.location, 
                    c.enabled, 
                    c.zone_id, 
                    z.name AS zone_name,
                    s.name AS station_name
                FROM cameras c
                LEFT JOIN zones z ON c.zone_id = z.id AND z.tenant_id = ?
                LEFT JOIN stations s ON z.station_id = s.id AND s.tenant_id = ?
                WHERE c.tenant_id = ?
                ORDER BY c.created_at DESC
            `, [req.tenantId, req.tenantId, req.tenantId])
            res.json({ status: 'success', data: rows })
        } catch (err) {
            res.status(500).json({ status: 'error', message: 'Erro ao buscar câmeras' })
        }
    })

    router.put('/:id', tenantMiddleware, async (req, res) => {
        const { id } = req.params
        const { name, model, location, enabled, zone_id } = req.body

        try {
            const isEnabled = (enabled === true || enabled === "1" || enabled === 1) ? 1 : 0
            const updatedZoneId = (!zone_id || zone_id === "" || zone_id === "null") ? null : zone_id
            const newCameraId = location

            const [exists] = await db.query(
                'SELECT id FROM cameras WHERE camera_id = ? AND tenant_id = ? AND id != ?',
                [newCameraId, req.tenantId, id]
            )

            if (exists.length > 0) {
                return res.status(409).json({
                    status: 'error',
                    message: 'Já existe uma câmera cadastrada com este IP'
                })
            }

            const [result] = await db.query(`
                UPDATE cameras
                SET 
                    camera_id = ?,
                    name = ?,
                    model = ?,
                    location = ?,
                    enabled = ?,
                    zone_id = ?
                WHERE id = ? AND tenant_id = ?
            `, [
                newCameraId,
                name,
                model,
                location,
                isEnabled,
                updatedZoneId,
                id,
                req.tenantId
            ])

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    status: 'error',
                    message: 'Câmera não encontrada'
                })
            }

            res.json({
                status: 'success',
                message: 'Câmera atualizada com sucesso'
            })
        } catch (err) {
            res.status(500).json({
                status: 'error',
                message: 'Erro ao salvar alterações'
            })
        }
    })

    router.post('/', tenantMiddleware, async (req, res) => {
        const { camera_id, name, model, location, zone_id } = req.body

        try {
            const [existing] = await db.query(
                'SELECT id FROM cameras WHERE camera_id = ? AND tenant_id = ?',
                [camera_id, req.tenantId]
            )

            if (existing.length > 0) {
                return res.status(409).json({
                    status: 'error',
                    message: 'Câmera já existe'
                })
            }

            const [result] = await db.query(
                'INSERT INTO cameras (camera_id, name, model, location, enabled, tenant_id, zone_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [camera_id, name, model || null, location || null, true, req.tenantId, zone_id || null]
            )

            res.json({
                status: 'success',
                message: 'Câmera cadastrada com sucesso',
                data: { id: result.insertId }
            })
        } catch (err) {
            res.status(500).json({
                status: 'error',
                message: 'Erro ao cadastrar câmera'
            })
        }
    })

    router.post('/vivotek/push', async (req, res) => {
        try {
            const payload = req.body
            const cameraIp = payload.Device?.IP || req.ip.replace('::ffff:', '')

            const tenantId = payload.TenantId || 1

            let inCount = 0
            let outCount = 0

            const counting = payload.Data?.find(d => d.RuleType === 'Counting')

            if (counting && Array.isArray(counting.CountingInfo)) {
                for (const info of counting.CountingInfo) {
                    inCount += Number(info.In || 0)
                    outCount += Number(info.Out || 0)
                }
            }

            const [camera] = await db.query(
                'SELECT id FROM cameras WHERE camera_id = ? AND tenant_id = ?',
                [cameraIp, tenantId]
            )

            let cameraId

            if (camera.length === 0) {
                const [insert] = await db.query(
                    'INSERT INTO cameras (camera_id, name, enabled, tenant_id) VALUES (?, ?, ?, ?)',
                    [cameraIp, `Camera ${cameraIp}`, true, tenantId]
                )
                cameraId = insert.insertId
            } else {
                cameraId = camera[0].id
            }

            await db.query(
                `
                INSERT INTO camera_counts
                (camera_id, tenant_id, entries, exits, created_at)
                VALUES (?, ?, ?, ?, NOW())
                `,
                [cameraId, tenantId, inCount, outCount]
            )

            res.sendStatus(200)
        } catch (err) {
            res.sendStatus(500)
        }
    })

    router.delete('/:id', tenantMiddleware, async (req, res) => {
        const { id } = req.params

        try {
            const [result] = await db.query(
                'DELETE FROM cameras WHERE id = ? AND tenant_id = ?',
                [id, req.tenantId]
            )

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    status: 'error',
                    message: 'Câmera não encontrada'
                })
            }

            res.json({
                status: 'success',
                message: 'Câmera removida'
            })
        } catch (err) {
            res.status(500).json({
                status: 'error',
                message: 'Erro ao excluir câmera'
            })
        }
    })

    return router
}
