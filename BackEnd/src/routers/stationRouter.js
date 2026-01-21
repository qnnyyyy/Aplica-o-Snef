const express = require('express');
const router = express.Router();
const tenantMiddleware = require('../tenantMiddleware');

module.exports = (dbPromise) => {
    
    router.get('/', tenantMiddleware, async (req, res) => {
        try {
            const [rows] = await dbPromise.query(
                'SELECT * FROM stations WHERE tenant_id = ? ORDER BY name', 
                [req.tenantId]
            );
            res.json({ status: 'success', data: rows });
        } catch (err) {
            console.error('ERRO GET STATIONS:', err);
            res.status(500).json({ status: 'error', message: err.message });
        }
    });

    router.post('/', tenantMiddleware, async (req, res) => {
        const { name, location } = req.body;
        
        if (!name) {
            return res.status(400).json({ status: 'error', message: 'Nome da estação é obrigatório' });
        }
        
        try {
            const [result] = await dbPromise.query(
                'INSERT INTO stations (name, location, tenant_id) VALUES (?, ?, ?)', 
                [name, location || null, req.tenantId]
            );
            
            res.json({ 
                status: 'success', 
                data: { id: result.insertId, name, location } 
            });
        } catch (err) {
            console.error('ERRO POST STATIONS:', err);
            res.status(500).json({ status: 'error', message: err.message });
        }
    });

    router.put('/:id', tenantMiddleware, async (req, res) => {
        const { id } = req.params;
        const { name, location } = req.body;

        try {
            const [result] = await dbPromise.query(
                'UPDATE stations SET name = ?, location = ? WHERE id = ? AND tenant_id = ?',
                [name, location, id, req.tenantId]
            );

            if (result.affectedRows === 0) {
                return res.status(404).json({ status: 'error', message: 'Estação não encontrada' });
            }

            res.json({ status: 'success', message: 'Estação atualizada com sucesso' });
        } catch (err) {
            console.error('ERRO PUT STATIONS:', err);
            res.status(500).json({ status: 'error', message: err.message });
        }
    });

    router.delete('/:id', tenantMiddleware, async (req, res) => {
        try {
            const [zonesCheck] = await dbPromise.query(
                'SELECT COUNT(*) as count FROM zones WHERE station_id = ? AND tenant_id = ?',
                [req.params.id, req.tenantId]
            );
            
            if (zonesCheck[0].count > 0) {
                return res.status(400).json({ 
                    status: 'error', 
                    message: 'Não é possível excluir estação com zonas vinculadas' 
                });
            }
            
            const [result] = await dbPromise.query(
                'DELETE FROM stations WHERE id = ? AND tenant_id = ?', 
                [req.params.id, req.tenantId]
            );
            
            if (result.affectedRows === 0) {
                return res.status(404).json({ status: 'error', message: 'Estação não encontrada' });
            }
            
            res.json({ status: 'success', message: 'Estação removida' });
        } catch (err) {
            console.error('ERRO DELETE STATIONS:', err);
            res.status(500).json({ status: 'error', message: err.message });
        }
    });

    return router;
};