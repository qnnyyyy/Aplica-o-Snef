const express = require('express');
const router = express.Router();
const tenantMiddleware = require('../tenantMiddleware');
const adminMiddleware = require('../adminMiddleware');

module.exports = (dbPromise) => {

    router.get('/', tenantMiddleware, async (req, res) => {
        try {
            const [rows] = await dbPromise.query(
                'SELECT * FROM zones WHERE tenant_id = ? ORDER BY name',
                [req.tenantId]
            );
            res.json({ status: 'success', data: rows });
        } catch (err) {
            console.error("Erro GET /zones:", err.message);
            res.status(500).json({ status: 'error', message: err.message });
        }
    });

    router.post('/', tenantMiddleware, adminMiddleware, async (req, res) => {
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({ status: 'error', message: 'Nome da zona é obrigatório' });
        }

        try {
            const [result] = await dbPromise.query(
                'INSERT INTO zones (name, tenant_id) VALUES (?, ?)',
                [name, req.tenantId]
            );

            res.json({
                status: 'success',
                data: { id: result.insertId, name }
            });
        } catch (err) {
            console.error("Erro POST /zones:", err.message);
            res.status(500).json({ status: 'error', message: err.message });
        }
    });

    router.put('/:id', tenantMiddleware, adminMiddleware, async (req, res) => {
        const { id } = req.params;
        const { name } = req.body;

        if (id === 'undefined' || !id) {
            return res.status(400).json({ status: 'error', message: 'ID da zona é inválido' });
        }

        try {
            const [result] = await dbPromise.query(
                'UPDATE zones SET name = ? WHERE id = ? AND tenant_id = ?',
                [name, id, req.tenantId]
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

    router.delete('/:id', tenantMiddleware, adminMiddleware, async (req, res) => {
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
