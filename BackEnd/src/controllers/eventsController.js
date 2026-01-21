module.exports = (db) => {
    return {
        processVivotek: async (req, res) => {
            const payload = req.body;
            const tenantId = req.headers['x-tenant-id'] || 1;

            try {
                const cameraIP = payload.Source?.IPAddress;

                if (!cameraIP) {
                    console.error('Payload recebido sem IPAddress');
                    return res.status(400).send('IPAddress não encontrado no payload');
                }

                const [rows] = await db.query(
                    'SELECT id FROM cameras WHERE location = ? AND tenant_id = ?',
                    [cameraIP, tenantId]
                );

                let internalId;

                if (rows.length > 0) {
                    internalId = rows[0].id;
                } else {
                    const cameraIdentifier = payload.Source?.MacAddress || cameraIP || 'Desconhecido';
                    const [result] = await db.query(
                        'INSERT INTO cameras (camera_id, name, location, model, enabled, tenant_id) VALUES (?, ?, ?, ?, ?, ?)',
                        [cameraIdentifier, `Câmera ${cameraIP}`, cameraIP, payload.Source?.ModelName || 'SC9133', true, tenantId]
                    );
                    internalId = result.insertId;
                }

                await db.query(
                    'INSERT INTO raw_payloads (camera_id, tenant_id, raw_json) VALUES (?, ?, ?)',
                    [internalId, tenantId, JSON.stringify(payload)]
                );

                res.sendStatus(200);
            } catch (err) {
                console.error('Erro ao processar dados da Vivotek:', err);
                res.status(500).send(err.message);
            }
        }
    };
};