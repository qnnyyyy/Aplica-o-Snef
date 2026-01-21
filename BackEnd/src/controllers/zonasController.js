const router = require('express').Router();

module.exports = (db) => {

    router.get('/', async (req, res) => {
        try {
            const [rows] = await db.query(`
                SELECT
                    z.id,
                    z.name,
                    z.description,
                    z.camera_id,
                    IFNULL(c.name, 'Câmera Excluída/Inexistente') AS camera_name,
                    c.camera_id AS camera_identifier
                FROM zones z
                LEFT JOIN cameras c ON c.id = z.camera_id
                ORDER BY z.created_at DESC
            `);

            res.json(rows);
        } catch (err) {
            console.error('Erro ao buscar zonas:', err);
            res.status(500).json({ message: 'Erro ao buscar zonas' });
        }
    });

    router.post('/', async (req, res) => {
        const { camera_id, name, description } = req.body;

        if (!camera_id || !name) {
            return res.status(400).json({
                message: 'camera_id e name são obrigatórios'
            });
        }

        try {
            await db.query(`
                INSERT INTO zones (camera_id, name, description)
                VALUES (?, ?, ?)
            `, [
                camera_id,
                name,
                description || null
            ]);

            res.status(201).json({ message: 'Zona cadastrada com sucesso' });

        } catch (err) {
            if (err.code === 'ER_NO_REFERENCED_ROW_2') {
                return res.status(400).json({ message: 'Câmera selecionada não existe no banco de dados' });
            }
            console.error('Erro ao cadastrar zona:', err);
            res.status(500).json({ message: 'Erro ao cadastrar zona' });
        }
    });

    return router;
};