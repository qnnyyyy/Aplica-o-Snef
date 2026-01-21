router.post('/reset-password/:token', async (req, res) => {
    const { token } = req.params
    const { password } = req.body

    if (!password) {
        return res.status(400).json({ message: 'Senha obrigatória' })
    }

    const [users] = await dbPromise.query(`
        SELECT id FROM users
        WHERE reset_token = ?
        AND reset_token_expires > NOW()
    `, [token])

    if (users.length === 0) {
        return res.status(400).json({ message: 'Token inválido ou expirado' })
    }

    const passwordHash = await bcrypt.hash(password, 10)

    await dbPromise.query(`
        UPDATE users
        SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL
        WHERE id = ?
    `, [passwordHash, users[0].id])

    res.json({ status: 'success' })
})
