module.exports = (db) => {
    return {
        getDashboard: async (req, res) => {
            try {
                const today = new Date()
                today.setHours(0, 0, 0, 0)

                const tomorrow = new Date(today)
                tomorrow.setDate(tomorrow.getDate() + 1)

                const [totals] = await db.query(`
                    SELECT
                        SUM(CAST(raw_json->>'$.Data[0].CountingInfo[0].In' AS UNSIGNED)) AS totalIn,
                        SUM(CAST(raw_json->>'$.Data[0].CountingInfo[0].Out' AS UNSIGNED)) AS totalOut
                    FROM raw_payloads
                    WHERE received_at >= ? AND received_at < ?
                `, [today, tomorrow])

                const [events] = await db.query(`
                    SELECT
                        rp.received_at,
                        c.name AS camera_name,
                        COALESCE(z.name, 'Geral') AS zone_name,
                        CAST(raw_json->>'$.Data[0].CountingInfo[0].In' AS UNSIGNED) AS countIn,
                        CAST(raw_json->>'$.Data[0].CountingInfo[0].Out' AS UNSIGNED) AS countOut
                    FROM raw_payloads rp
                    JOIN cameras c ON c.id = rp.camera_id
                    LEFT JOIN zones z ON c.zone_id = z.id
                    WHERE rp.received_at >= ? AND rp.received_at < ?
                    ORDER BY rp.received_at DESC
                    LIMIT 10
                `, [today, tomorrow])

                const [cameraStatus] = await db.query(`
                    SELECT 
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

                const latestEvents = events.map(e => ({
                    event_time: e.received_at,
                    total_in: e.countIn || 0,
                    total_out: e.countOut || 0,
                    camera: e.camera_name,
                    zone: e.zone_name
                }))

                res.json({
                    status: 'success',
                    data: {
                        totalIn: totals[0].totalIn || 0,
                        totalOut: totals[0].totalOut || 0,
                        latestEvents: latestEvents,
                        cameraStatus: cameraStatus
                    }
                })

            } catch (err) {
                console.error('Erro no Controller Dashboard:', err)
                res.status(500).json({
                    status: 'error',
                    message: err.message
                })
            }
        }
    }
}