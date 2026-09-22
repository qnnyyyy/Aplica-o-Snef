const cron = require('node-cron')

const RETENTION_DAYS = 365

function start(dbPromise) {
    // roda uma vez por mês; daily_counts/hourly_counts já guardam o resumo histórico,
    // então só o evento bruto (raw_payloads) mais antigo que RETENTION_DAYS é removido
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
