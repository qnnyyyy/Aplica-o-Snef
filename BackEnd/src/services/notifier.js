async function notifySlack(dbPromise, tenantId, message) {
    try {
        const [rows] = await dbPromise.query('SELECT slack_webhook_url FROM tenants WHERE id = ?', [tenantId])
        const webhookUrl = rows[0]?.slack_webhook_url

        if (!webhookUrl) return

        await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: message })
        })
    } catch (err) {
        console.error('Erro ao notificar Slack:', err.message)
    }
}

module.exports = { notifySlack }
