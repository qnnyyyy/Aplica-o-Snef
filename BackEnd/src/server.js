require('dotenv').config()
const express = require('express')
const mysql = require('mysql2')
const cors = require('cors')
const path = require('path')

const app = express()

const db = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
})

const dbPromise = db.promise()

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}))

app.use(express.json())

const frontendPath = path.resolve(__dirname, '..', '..', 'frontend', 'frontend')
app.use(express.static(frontendPath, { index: false }))

const apiRouter = require('./apiRouter')
app.use('/api', apiRouter(dbPromise))

const authRouter = require('./routers/authRouter')
app.use('/api/auth', authRouter(dbPromise))

const cameraRouter = require('./routers/cameraRouter')
app.use('/api/cameras', cameraRouter(dbPromise))

const zonaRouter = require('./routers/zonaRouter')
app.use('/api/zones', zonaRouter(dbPromise))

const stationRouter = require('./routers/stationRouter')
app.use('/api/stations', stationRouter(dbPromise))

const teamRouter = require('./routers/teamRouter')
app.use('/api/team', teamRouter(dbPromise))

const cameraApiKeyMiddleware = require('./cameraApiKeyMiddleware')
const verifyCameraApiKey = cameraApiKeyMiddleware(dbPromise)

app.post('/vivotek/push', verifyCameraApiKey, async (req, res) => {
    const payload = req.body
    let tenantId = req.tenantId

    const cameraSerial =
        payload.Device_ID ||
        payload?.Source?.IPAddress ||
        'Desconhecido'

    try {
        const [rows] = await dbPromise.query(
            'SELECT id, zone_id FROM cameras WHERE camera_id = ? AND tenant_id = ?',
            [cameraSerial, tenantId]
        )

        let internalId
        let zoneId = null

        if (rows.length > 0) {
            internalId = rows[0].id
            zoneId = rows[0].zone_id
        } else {
            try {
                const [result] = await dbPromise.query(
                    'INSERT INTO cameras (camera_id, name, enabled, tenant_id) VALUES (?, ?, ?, ?)',
                    [cameraSerial, `Câmera ${cameraSerial}`, true, tenantId]
                )
                internalId = result.insertId
            } catch (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                    const [existing] = await dbPromise.query(
                        'SELECT id, zone_id, tenant_id FROM cameras WHERE camera_id = ? AND tenant_id = ?',
                        [cameraSerial, tenantId]
                    )
                    internalId = existing[0].id
                    zoneId = existing[0].zone_id
                    tenantId = existing[0].tenant_id
                } else {
                    throw err
                }
            }
        }

        await dbPromise.query(
            'INSERT INTO raw_payloads (camera_id, tenant_id, raw_json) VALUES (?, ?, ?)',
            [internalId, tenantId, JSON.stringify(payload)]
        )

        // câmera voltou a enviar dados: limpa o alerta de offline pra ela poder alertar de novo se cair no futuro
        await dbPromise.query('UPDATE cameras SET last_alert_sent_at = NULL WHERE id = ?', [internalId])

        const analyticData = payload.Analytic_Data

        if (Array.isArray(analyticData)) {
            for (const event of analyticData) {
                const eventTime = event.Timestamp || new Date()

                if (event.Direction_IN !== undefined) {
                    await dbPromise.query(
                        "INSERT INTO people_count_events (camera_id, zone_id, direction, count, event_time, tenant_id) VALUES (?, ?, 'IN', ?, ?, ?)",
                        [internalId, zoneId, event.Direction_IN, eventTime, tenantId]
                    )
                }

                if (event.Direction_OUT !== undefined) {
                    await dbPromise.query(
                        "INSERT INTO people_count_events (camera_id, zone_id, direction, count, event_time, tenant_id) VALUES (?, ?, 'OUT', ?, ?, ?)",
                        [internalId, zoneId, event.Direction_OUT, eventTime, tenantId]
                    )
                }
            }
        }

        res.sendStatus(200)
    } catch (err) {
        console.error('Erro ao processar push Vivotek:', err.message)
        res.status(500).send(err.message)
    }
})

app.get('/', (req, res) => {
    res.sendFile(path.join(frontendPath, 'home.html'))
})

const PORT = 3000
app.listen(PORT, '0.0.0.0', async () => {
    try {
        await dbPromise.query('SELECT 1')
        console.log(`Servidor rodando em http://localhost:${PORT}`)
        console.log(`Banco de dados conectado com sucesso`)

        require('./services/cameraMonitor').start(dbPromise)
        require('./services/reportScheduler').start(dbPromise)
        require('./services/auditDigest').start(dbPromise)
        require('./services/dataRetention').start(dbPromise)
    } catch (e) {
        console.error('Erro crítico ao iniciar:', e.message)
        process.exit(1)
    }
})
