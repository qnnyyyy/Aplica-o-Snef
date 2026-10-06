const cron = require('node-cron')

const RETENTION_DAYS = 365

function start(dbPromise) {
    // só apaga o payload bruto, os resumos diários e por hora continuam
    cron.schedule('0 4 1 * *', async () => {
        try {
            const [result] = await dbPromise.query(
                `DELETE FROM raw_payloads WHERE received_at < NOW() - INTERVAL ${RETENTION_DAYS} DAY`
            )
            if (result.affectedRows > 0) {
                console.log(`Limpeza de retenção: ${result.affectedRows} eventos com mais de ${RETENTION_DAYS} dias removidos.`)
            }
        } catch (err) {
            console.error('Erro na limpeza de retenção de dados:', err.message)
        }
    }, { timezone: 'America/Sao_Paulo' })
}

module.exports = { start }
