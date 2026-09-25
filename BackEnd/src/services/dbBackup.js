const cron = require('node-cron')
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const { transporter, logoAttachment } = require('../utils/mailer')

const BACKUP_DIR = path.join(__dirname, '..', '..', 'backups')
const RETENTION_DIAS = 14

function start(dbPromise) {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true })

    cron.schedule('0 3 * * *', () => executarBackup(dbPromise), { timezone: 'America/Sao_Paulo' })
}

async function executarBackup(dbPromise) {
    try {
        const sql = await gerarDump(dbPromise)
        const nomeArquivo = `snef-backup-${carimboData()}.sql.gz`
        const caminho = path.join(BACKUP_DIR, nomeArquivo)

        fs.writeFileSync(caminho, zlib.gzipSync(sql))
        limparBackupsAntigos()

        console.log(`[Backup] Concluído: ${nomeArquivo}`)
    } catch (err) {
        console.error('[Backup] Erro ao gerar backup do banco:', err.message)
        await avisarFalha(dbPromise, err.message)
    }
}

function escaparValor(dbPromise, valor) {
    if (valor !== null && typeof valor === 'object' && !(valor instanceof Date) && !Buffer.isBuffer(valor)) {
        return dbPromise.escape(JSON.stringify(valor))
    }
    return dbPromise.escape(valor)
}

function carimboData() {
    const d = new Date()
    const pad = n => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`
}

async function gerarDump(dbPromise) {
    const [tabelas] = await dbPromise.query('SHOW TABLES')
    const nomeColuna = Object.keys(tabelas[0])[0]

    const [[{ mode }]] = await dbPromise.query('SELECT @@sql_mode AS mode')
    let sql = `-- Backup SNEF gerado em ${new Date().toISOString()}\nSET FOREIGN_KEY_CHECKS=0;\nSET SESSION sql_mode='${mode}';\n\n`

    for (const row of tabelas) {
        const tabela = row[nomeColuna]

        const [[criacao]] = await dbPromise.query(`SHOW CREATE TABLE \`${tabela}\``)
        sql += `DROP TABLE IF EXISTS \`${tabela}\`;\n${criacao['Create Table']};\n\n`

        const [colunasInfo] = await dbPromise.query(
            `SELECT COLUMN_NAME FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND EXTRA NOT LIKE '%GENERATED%'
             ORDER BY ORDINAL_POSITION`,
            [tabela]
        )
        const colunas = colunasInfo.map(c => c.COLUMN_NAME)

        const [linhas] = await dbPromise.query(`SELECT * FROM \`${tabela}\``)
        if (linhas.length > 0 && colunas.length > 0) {
            const valores = linhas.map(linha =>
                `(${colunas.map(c => escaparValor(dbPromise, linha[c])).join(', ')})`
            )
            sql += `INSERT INTO \`${tabela}\` (${colunas.map(c => `\`${c}\``).join(', ')}) VALUES\n${valores.join(',\n')};\n\n`
        }
    }

    sql += 'SET FOREIGN_KEY_CHECKS=1;\n'
    return sql
}

function limparBackupsAntigos() {
    const limite = Date.now() - RETENTION_DIAS * 24 * 3600000

    for (const arquivo of fs.readdirSync(BACKUP_DIR)) {
        const caminho = path.join(BACKUP_DIR, arquivo)
        if (fs.statSync(caminho).mtimeMs < limite) fs.unlinkSync(caminho)
    }
}

async function avisarFalha(dbPromise, mensagemErro) {
    try {
        const [donos] = await dbPromise.query(
            "SELECT DISTINCT email, name FROM users WHERE role = 'DONO' AND active = TRUE"
        )

        for (const dono of donos) {
            await transporter.sendMail({
                from: process.env.MAIL_FROM,
                to: dono.email,
                subject: 'Falha no backup do banco de dados | SNEF',
                html: `
                <div style="background:#f4f2f8;padding:40px;font-family:Arial;text-align:center">
                    <div style="max-width:420px;background:#fff;border-radius:14px;padding:30px;margin:auto">
                        <img src="cid:snef-logo" alt="Groupe SNEF" style="max-width:140px;margin-bottom:20px">
                        <h2 style="color:#b3261e">O backup automático do banco falhou</h2>
                        <p>Motivo: ${mensagemErro}</p>
                        <p style="color:#888;font-size:13px">O sistema vai tentar de novo no próximo horário agendado.</p>
                    </div>
                </div>`,
                attachments: [logoAttachment()]
            }).catch(err => console.error('[Backup] Erro ao enviar e-mail de falha:', err.message))
        }
    } catch (err) {
        console.error('[Backup] Erro ao buscar destinatários do aviso de falha:', err.message)
    }
}

module.exports = { start, executarBackup }
