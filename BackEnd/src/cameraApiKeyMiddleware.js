module.exports = (dbPromise) => async (req, res, next) => {
    const apiKey = req.headers['x-api-key'] || req.query.key

    if (!apiKey) {
        return res.status(401).json({ status: 'error', message: 'Chave de API da câmera não informada' })
    }

    try {
        const [rows] = await dbPromise.query('SELECT id FROM tenants WHERE api_key = ?', [apiKey])

        if (rows.length === 0) {
            return res.status(403).json({ status: 'error', message: 'Chave de API inválida' })
        }

        req.tenantId = rows[0].id
        next()
    } catch (err) {
        res.status(500).json({ status: 'error', message: 'Erro ao validar chave de API' })
    }
}
