module.exports = (req, res, next) => {
    if ((req.user?.role || '').toLowerCase() !== 'admin') {
        return res.status(403).json({
            status: 'error',
            message: 'Apenas administradores podem realizar esta ação.'
        })
    }
    next()
}
