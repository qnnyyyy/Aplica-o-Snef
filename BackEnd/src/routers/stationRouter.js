const express = require('express');
const router = express.Router();
const tenantMiddleware = require('../tenantMiddleware');
const adminMiddleware = require('../adminMiddleware');

module.exports = (dbPromise) => {

    router.get('/', tenantMiddleware, async (req, res) => {
        try {
            const [rows] = await dbPromise.query(
                'SELECT id, name, location FROM tenants WHERE id = ?',
                [req.tenantId]
            );
            res.json({ status: 'success', data: rows[0] || null });
        } catch (err) {
            res.status(500).json({ status: 'error', message: 'Erro ao buscar dados da estação' });
        }
    });

    router.put('/', tenantMiddleware, adminMiddleware, async (req, res) => {
        const { name, location } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ status: 'error', message: 'Nome da estação é obrigatório' });
        }

        try {
            await dbPromise.query(
                'UPDATE tenants SET name = ?, location = ? WHERE id = ?',
                [name.trim(), location || null, req.tenantId]
            );
            res.json({ status: 'success', message: 'Estação atualizada com sucesso' });
        } catch (err) {
            res.status(500).json({ status: 'error', message: 'Erro ao atualizar estação' });
        }
    });

    return router;
};
