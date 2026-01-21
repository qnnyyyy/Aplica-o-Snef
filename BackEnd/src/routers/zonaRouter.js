const express = require('express');
const router = express.Router();
const tenantMiddleware = require('../tenantMiddleware');

module.exports = (dbPromise) => {
    
    router.get('/', tenantMiddleware, async (req, res) => {
        try {
            const sql = `
                SELECT z.*, s.name as station_name 
                FROM zones z 
                LEFT JOIN stations s ON z.station_id = s.id AND s.tenant_id = ?
                WHERE z.tenant_id = ?
                ORDER BY z.name`;
            const [rows] = await dbPromise.query(sql, [req.tenantId, req.tenantId]);
            res.json({ status: 'success', data: rows });
        } catch (err) {
            console.error("Erro GET /zones:", err.message);
            res.status(500).json({ status: 'error', message: err.message });
        }
    });

    router.post('/', tenantMiddleware, async (req, res) => {
        const { name, station_id } = req.body;
        
        if (!name) {
            return res.status(400).json({ status: 'error', message: 'Nome da zona é obrigatório' });
        }
        
        try {
            if (station_id) {
                const [stationCheck] = await dbPromise.query(
                    'SELECT id FROM stations WHERE id = ? AND tenant_id = ?',
                    [station_id, req.tenantId]
                );
                
                if (stationCheck.length === 0) {
                    return res.status(400).json({ status: 'error', message: 'Estação não pertence ao seu tenant' });
                }
            }
            
            const [result] = await dbPromise.query(
                'INSERT INTO zones (name, station_id, tenant_id) VALUES (?, ?, ?)', 
                [name, station_id || null, req.tenantId]
            );
            
            res.json({ 
                status: 'success', 
                data: { id: result.insertId, name, station_id } 
            });
        } catch (err) {
            console.error("Erro POST /zones:", err.message);
            res.status(500).json({ status: 'error', message: err.message });
        }
    });

    router.put('/:id', tenantMiddleware, async (req, res) => {
        const { id } = req.params;
        const { name, station_id } = req.body;

        if (id === 'undefined' || !id) {
            return res.status(400).json({ status: 'error', message: 'ID da zona é inválido' });
        }

        try {
            if (station_id) {
                const [stationCheck] = await dbPromise.query(
                    'SELECT id FROM stations WHERE id = ? AND tenant_id = ?',
                    [station_id, req.tenantId]
                );
                
                if (stationCheck.length === 0) {
                    return res.status(400).json({ status: 'error', message: 'Estação não pertence ao seu tenant' });
                }
            }
            
            const [result] = await dbPromise.query(
                'UPDATE zones SET name = ?, station_id = ? WHERE id = ? AND tenant_id = ?',
                [name, station_id || null, id, req.tenantId]
            );
            
            if (result.affectedRows === 0) {
                return res.status(404).json({ status: 'error', message: 'Zona não encontrada' });
            }
            
            res.json({ status: 'success', message: 'Zona atualizada' });
        } catch (err) {
            console.error("Erro PUT /zones:", err.message);
            res.status(500).json({ status: 'error', message: err.message });
        }
    });

    router.delete('/:id', tenantMiddleware, async (req, res) => {
        try {
            const [camerasCheck] = await dbPromise.query(
                'SELECT COUNT(*) as count FROM cameras WHERE zone_id = ? AND tenant_id = ?',
                [req.params.id, req.tenantId]
            );
            
            if (camerasCheck[0].count > 0) {
                return res.status(400).json({ 
                    status: 'error', 
                    message: 'Não é possível excluir zona com câmeras vinculadas' 
                });
            }
            
            const [result] = await dbPromise.query(
                'DELETE FROM zones WHERE id = ? AND tenant_id = ?', 
                [req.params.id, req.tenantId]
            );
            
            if (result.affectedRows === 0) {
                return res.status(404).json({ status: 'error', message: 'Zona não encontrada' });
            }
            
            res.json({ status: 'success', message: 'Zona removida' });
        } catch (err) {
            console.error("Erro DELETE /zones:", err.message);
            res.status(500).json({ status: 'error', message: err.message });
        }
    });

    return router;
};