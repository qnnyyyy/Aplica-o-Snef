const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
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
        
        const tenantId = req.user.tenant_id || 1;
        req.tenantId = tenantId;
        
        next();
    } catch (err) {
        console.error('Erro ao verificar token:', err.message);
        res.status(403).json({ 
            status: 'error', 
            message: 'Token inválido ou expirado.' 
        });
    }
};