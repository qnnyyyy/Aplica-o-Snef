const express = require('express')
const router = express.Router()

module.exports = (dbPromise) => {
    router.get('/dashboard', async (req, res) => {
        try {
            const { camera_id } = req.query;
            const hoje = new Date().toISOString().split('T')[0]

            let cameraFilterSql = "";
            let queryParams = [hoje];

            if (camera_id && camera_id !== 'all') {
                cameraFilterSql = " AND camera_id = ?";
                queryParams.push(camera_id);
            }

            const [totais] = await dbPromise.query(`
                SELECT 
                    IFNULL(SUM(CAST(raw_json->>'$.Data[0].CountingInfo[0].In' AS UNSIGNED)), 0) AS totalIn,
                    IFNULL(SUM(CAST(raw_json->>'$.Data[0].CountingInfo[0].Out' AS UNSIGNED)), 0) AS totalOut
                FROM raw_payloads 
                WHERE DATE(received_at) = ? ${cameraFilterSql}
            `, queryParams)

            const eventosFilterSql = camera_id && camera_id !== 'all' ? " AND rp.camera_id = ?" : "";
            const [eventos] = await dbPromise.query(`
                SELECT 
                    rp.received_at AS event_time,
                    c.name AS camera,
                    IFNULL(z.name, 'Geral') AS zone,
                    CAST(rp.raw_json->>'$.Data[0].CountingInfo[0].In' AS UNSIGNED) AS total_in,
                    CAST(rp.raw_json->>'$.Data[0].CountingInfo[0].Out' AS UNSIGNED) AS total_out
                FROM raw_payloads rp
                INNER JOIN cameras c ON rp.camera_id = c.id
                LEFT JOIN zones z ON z.camera_id = c.id
                WHERE DATE(rp.received_at) = ? ${eventosFilterSql}
                ORDER BY rp.received_at DESC
                LIMIT 10
            `, queryParams)

            const [statusCameras] = await dbPromise.query(`
                SELECT 
                    c.id,
                    c.name, 
                    MAX(rp.received_at) as last_seen,
                    CASE 
                        WHEN MAX(rp.received_at) >= NOW() - INTERVAL 10 MINUTE THEN 'online'
                        ELSE 'offline'
                    END as status
                FROM cameras c
                LEFT JOIN raw_payloads rp ON c.id = rp.camera_id
                WHERE c.enabled = TRUE
                GROUP BY c.id
            `)

            res.json({
                status: 'success',
                data: {
                    totalIn: totais[0].totalIn,
                    totalOut: totais[0].totalOut,
                    latestEvents: eventos,
                    cameraStatus: statusCameras
                }
            })
        } catch (err) {
            res.status(500).json({ status: 'error', message: err.message })
        }
    })

    return router
}