const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

const simpleAuthMiddleware = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ 
            status: 'error', 
            message: 'Token não fornecido.' 
        });
    }

    try {
        const verified = jwt.verify(token, process.env.JWT_SECRET);
        req.user = verified;
        req.tenantId = req.user.tenant_id || 1;
        next();
    } catch (err) {
        console.error('Erro token:', err.message);
        res.status(403).json({ 
            status: 'error', 
            message: 'Token inválido.' 
        });
    }
};

module.exports = (dbPromise) => {
    global.dbPromise = dbPromise;

    router.get('/dashboard', simpleAuthMiddleware, async (req, res) => {
        try {
            const { camera_id } = req.query;
            let params = [req.tenantId];
            let filter = "";
            
            if (camera_id && camera_id !== 'all' && camera_id !== '') {
                filter = " AND rp.camera_id = ?";
                params.push(camera_id);
            }

            const [cameras] = await dbPromise.query(
                'SELECT id, name FROM cameras WHERE enabled = TRUE AND tenant_id = ? ORDER BY name',
                [req.tenantId]
            );

            const [totais] = await dbPromise.query(`
                SELECT 
                    IFNULL(SUM(CAST(raw_json->>'$.Data[0].CountingInfo[0].In' AS UNSIGNED)), 0) AS totalIn,
                    IFNULL(SUM(CAST(raw_json->>'$.Data[0].CountingInfo[0].Out' AS UNSIGNED)), 0) AS totalOut
                FROM raw_payloads rp
                WHERE DATE(rp.received_at) = CURDATE()
                AND rp.tenant_id = ?
                ${filter}`, params);

            const [eventos] = await dbPromise.query(`
                SELECT 
                    rp.received_at AS event_time,
                    c.name AS camera,
                    CAST(rp.raw_json->>'$.Data[0].CountingInfo[0].In' AS UNSIGNED) AS total_in,
                    CAST(rp.raw_json->>'$.Data[0].CountingInfo[0].Out' AS UNSIGNED) AS total_out
                FROM raw_payloads rp
                INNER JOIN cameras c ON rp.camera_id = c.id AND c.tenant_id = ?
                WHERE DATE(rp.received_at) = CURDATE() 
                AND rp.tenant_id = ?
                ${filter}
                ORDER BY rp.received_at DESC LIMIT 100`, [req.tenantId, req.tenantId, ...(filter ? [camera_id] : [])]);

            const [status] = await dbPromise.query(`
                SELECT 
                    c.id, 
                    c.name, 
                    MAX(rp.received_at) as last_seen,
                    CASE 
                        WHEN MAX(rp.received_at) >= NOW() - INTERVAL 15 MINUTE THEN 'online' 
                        ELSE 'offline' 
                    END as status
                FROM cameras c 
                LEFT JOIN raw_payloads rp ON c.id = rp.camera_id AND rp.tenant_id = c.tenant_id
                WHERE c.enabled = TRUE 
                AND c.tenant_id = ?
                GROUP BY c.id, c.name`, [req.tenantId]);

            res.json({ 
                status: 'success', 
                data: { 
                    totalIn: totais[0].totalIn || 0, 
                    totalOut: totais[0].totalOut || 0, 
                    latestEvents: eventos, 
                    cameraStatus: status,
                    availableCameras: cameras 
                } 
            });
        } catch (err) { 
            console.error('Erro no Dashboard:', err);
            res.status(500).json({ status: 'error', message: err.message }); 
        }
    });

    router.get('/reports', simpleAuthMiddleware, async (req, res) => {
        const { dateStart, dateEnd, timeStart, timeEnd, station, zone, camera } = req.query;
        
        try {
            let conditions = [];
            let params = [];

            conditions.push('rp.tenant_id = ?');
            params.push(req.tenantId);

            if (dateStart && dateStart.trim() !== '') {
                const tsStart = timeStart && timeStart.trim() !== '' ? `${dateStart} ${timeStart}:00` : `${dateStart} 00:00:00`;
                conditions.push('rp.received_at >= ?');
                params.push(tsStart);
            }
            
            if (dateEnd && dateEnd.trim() !== '') {
                const tsEnd = timeEnd && timeEnd.trim() !== '' ? `${dateEnd} ${timeEnd}:59` : `${dateEnd} 23:59:59`;
                conditions.push('rp.received_at <= ?');
                params.push(tsEnd);
            }

            if (station && station !== "") {
                conditions.push('z.station_id = ?');
                params.push(station);
            }
            
            if (zone && zone !== "") {
                conditions.push('c.zone_id = ?');
                params.push(zone);
            }
            
            if (camera && camera !== "" && camera !== "all") {
                conditions.push('c.id = ?');
                params.push(camera);
            }

            const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : 'WHERE 1=1';

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
                INNER JOIN cameras c ON rp.camera_id = c.id AND c.tenant_id = ?
                LEFT JOIN zones z ON c.zone_id = z.id AND z.tenant_id = ?
                LEFT JOIN stations s ON z.station_id = s.id AND s.tenant_id = ?
                ${whereClause}
                ORDER BY rp.received_at DESC
                LIMIT 2000
            `;
            
            const queryParams = [req.tenantId, req.tenantId, req.tenantId, ...params];
            
            console.log('Executando query reports com params:', queryParams.length);
            
            const [rows] = await dbPromise.query(query, queryParams);
            res.json({ status: 'success', data: { details: rows } });
        } catch (err) {
            console.error("Erro SQL no Relatório:", err.message);
            console.error("SQL error:", err.sql);
            res.status(500).json({ status: 'error', message: 'Erro ao gerar relatório: ' + err.message });
        }
    });

    router.get('/reports/filters', simpleAuthMiddleware, async (req, res) => {
        try {
            const [stations] = await dbPromise.query(
                'SELECT id, name FROM stations WHERE tenant_id = ? ORDER BY name', 
                [req.tenantId]
            );
            const [zones] = await dbPromise.query(
                'SELECT id, name, station_id FROM zones WHERE tenant_id = ? ORDER BY name', 
                [req.tenantId]
            );
            const [cameras] = await dbPromise.query(
                'SELECT id, name, camera_id, zone_id FROM cameras WHERE enabled = TRUE AND tenant_id = ? ORDER BY name', 
                [req.tenantId]
            );
            res.json({ status: 'success', data: { stations, zones, cameras } });
        } catch (err) {
            console.error('Erro em /reports/filters:', err);
            res.status(500).json({ status: 'error', message: err.message });
        }
    });

    router.get('/tenant-info', simpleAuthMiddleware, async (req, res) => {
        try {
            const [tenant] = await dbPromise.query(
                'SELECT id, name FROM tenants WHERE id = ?',
                [req.tenantId]
            );
            
            const [stats] = await dbPromise.query(`
                SELECT 
                    (SELECT COUNT(*) FROM cameras WHERE tenant_id = ?) as total_cameras,
                    (SELECT COUNT(*) FROM users WHERE tenant_id = ? AND active = TRUE) as total_users,
                    (SELECT COUNT(*) FROM stations WHERE tenant_id = ?) as total_stations,
                    (SELECT COUNT(*) FROM zones WHERE tenant_id = ?) as total_zones
            `, [req.tenantId, req.tenantId, req.tenantId, req.tenantId]);
            
            res.json({ 
                status: 'success', 
                data: { 
                    tenant: tenant[0] || { id: req.tenantId, name: 'Cliente Padrão' }, 
                    stats: stats[0] 
                } 
            });
        } catch (err) {
            console.error('Erro em /tenant-info:', err);
            res.status(500).json({ status: 'error', message: err.message });
        }
    });

    return router;
};