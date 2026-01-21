const express = require('express');
const router = express.Router();

module.exports = (dbPromise) => {
    router.get('/filters', async (req, res) => {
        try {
            const [stations] = await dbPromise.query('SELECT id, name FROM stations ORDER BY name');
            const [zones] = await dbPromise.query('SELECT id, name, station_id FROM zones ORDER BY name');
            const [cameras] = await dbPromise.query('SELECT id, name, camera_id, zone_id FROM cameras WHERE enabled = TRUE ORDER BY name');
            
            res.json({ 
                status: 'success', 
                data: { stations, zones, cameras } 
            });
        } catch (err) {
            res.status(500).json({ status: 'error', message: err.message });
        }
    });

    router.get('/', async (req, res) => {
        const { dateStart, dateEnd, timeStart, timeEnd, station, zone, camera } = req.query;
        let conditions = [];
        let params = [];

        if (dateStart) {
            const tsStart = timeStart ? `${dateStart} ${timeStart}:00` : `${dateStart} 00:00:00`;
            conditions.push('rp.received_at >= ?');
            params.push(tsStart);
        }
        if (dateEnd) {
            const tsEnd = timeEnd ? `${dateEnd} ${timeEnd}:59` : `${dateEnd} 23:59:59`;
            conditions.push('rp.received_at <= ?');
            params.push(tsEnd);
        }

        if (station) {
            conditions.push('z.station_id = ?');
            params.push(station);
        }
        if (zone) {
            conditions.push('c.zone_id = ?');
            params.push(zone);
        }
        if (camera) {
            conditions.push('c.id = ?');
            params.push(camera);
        }

        const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

        try {
            const query = `
                SELECT
                    rp.received_at AS event_time,
                    s.name AS station,
                    c.name AS camera_friendly_name,
                    c.camera_id AS camera_serial,
                    IFNULL(z.name, 'Geral') AS zone,
                    CAST(rp.raw_json->>'$.Data[0].CountingInfo[0].In' AS UNSIGNED) AS total_in,
                    CAST(rp.raw_json->>'$.Data[0].CountingInfo[0].Out' AS UNSIGNED) AS total_out
                FROM raw_payloads rp
                INNER JOIN cameras c ON rp.camera_id = c.id
                LEFT JOIN zones z ON c.zone_id = z.id
                LEFT JOIN stations s ON z.station_id = s.id
                ${whereClause}
                ORDER BY rp.received_at DESC
                LIMIT 1000
            `;
            const [rows] = await dbPromise.query(query, params);
            res.json({ status: 'success', data: { details: rows } });
        } catch (err) {
            res.status(500).json({ status: 'error', message: err.message });
        }
    });

    return router;
};