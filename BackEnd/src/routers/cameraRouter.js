const express = require('express');
const router = express.Router();
const tenantMiddleware = require('../tenantMiddleware');

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
            `, [req.tenantId, req.tenantId, req.tenantId]);
            res.json({ status: 'success', data: rows });
        } catch (err) {
            console.error('Erro ao buscar câmeras:', err)
            res.status(500).json({ status: 'error', message: 'Erro ao buscar câmeras' });
        }
    });

    router.put('/:id', tenantMiddleware, async (req, res) => {
        const { id } = req.params;
        const { name, model, location, enabled, zone_id } = req.body;
        
        try {
            const isEnabled = (enabled === true || enabled === "1" || enabled === 1) ? 1 : 0;
            const updatedZoneId = (!zone_id || zone_id === "" || zone_id === "null") ? null : zone_id;

            const [result] = await db.query(`
                UPDATE cameras 
                SET name = ?, model = ?, location = ?, enabled = ?, zone_id = ? 
                WHERE id = ? AND tenant_id = ?
            `, [name, model, location, isEnabled, updatedZoneId, id, req.tenantId]);

            if (result.affectedRows === 0) {
                return res.status(404).json({ status: 'error', message: 'Câmera não encontrada ou não pertence ao seu tenant' });
            }

            res.json({ status: 'success', message: 'Câmera atualizada com sucesso' });
        } catch (err) {
            console.error('Erro ao atualizar câmera:', err)
            res.status(500).json({ status: 'error', message: 'Erro ao salvar alterações.' });
        }
    });

    router.post('/', tenantMiddleware, async (req, res) => {
        const { camera_id, name, model, location, zone_id } = req.body;
        
        try {
            const [existing] = await db.query(
                'SELECT id FROM cameras WHERE camera_id = ? AND tenant_id = ?',
                [camera_id, req.tenantId]
            );
            
            if (existing.length > 0) {
                return res.status(409).json({ status: 'error', message: 'Câmera já existe' });
            }
            
            const [result] = await db.query(
                'INSERT INTO cameras (camera_id, name, model, location, enabled, tenant_id, zone_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [camera_id, name, model || null, location || null, true, req.tenantId, zone_id || null]
            );
            
            res.json({ 
                status: 'success', 
                message: 'Câmera cadastrada com sucesso',
                data: { id: result.insertId }
            });
        } catch (err) {
            console.error('Erro ao cadastrar câmera:', err);
            res.status(500).json({ status: 'error', message: 'Erro ao cadastrar câmera' });
        }
    });

    router.delete('/:id', tenantMiddleware, async (req, res) => {
        const { id } = req.params;
        
        try {
            const [result] = await db.query(
                'DELETE FROM cameras WHERE id = ? AND tenant_id = ?',
                [id, req.tenantId]
            );
            
            if (result.affectedRows === 0) {
                return res.status(404).json({ status: 'error', message: 'Câmera não encontrada' });
            }
            
            res.json({ status: 'success', message: 'Câmera removida' });
        } catch (err) {
            console.error('Erro ao excluir câmera:', err);
            res.status(500).json({ status: 'error', message: 'Erro ao excluir câmera' });
        }
    });

    return router;
};