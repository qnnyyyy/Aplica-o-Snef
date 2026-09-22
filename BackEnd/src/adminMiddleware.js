module.exports = (req, res, next) => {
    const role = (req.user?.role || '').toLowerCase()

    if (role !== 'admin' && role !== 'dono') {
        return res.status(403).json({
            status: 'error',
            message: 'Apenas administradores podem realizar esta ação.'
        })
    }
    next()
}
