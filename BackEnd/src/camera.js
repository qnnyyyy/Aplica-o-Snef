require('dotenv').config()
const express = require('express')
const mysql = require('mysql2')
const cors = require('cors')
const path = require('path')

const app = express()

const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
})

const dbPromise = db.promise()

app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID']
}))

app.use(express.json())

const frontendPath = path.resolve(__dirname, '..', '..', 'frontend', 'frontend')
app.use(express.static(frontendPath, { index: false }))

const apiRouter = require('./apiRouter')
app.use('/api', apiRouter(dbPromise))

app.post('/vivotek/push', async (req, res) => {
    const payload = req.body
    const cameraSerial = payload.Device_ID || 'Desconhecido'
    const tenantHeader = req.headers['x-tenant-id']
    
    try {
        let tenantId;
        
        if (tenantHeader) {
            tenantId = parseInt(tenantHeader);
        } else {
            const [tenant] = await dbPromise.query(
                'SELECT id FROM tenants WHERE slug = "default" LIMIT 1'
            );
            tenantId = tenant[0]?.id || 1;
        }
        
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
            const [result] = await dbPromise.query(
                'INSERT INTO cameras (camera_id, name, enabled, tenant_id) VALUES (?, ?, ?, ?)',
                [cameraSerial, `Câmera ${cameraSerial}`, true, tenantId]
            )
            internalId = result.insertId
        }

        await dbPromise.query(
            'INSERT INTO raw_payloads (camera_id, tenant_id, raw_json) VALUES (?, ?, ?)',
            [internalId, tenantId, JSON.stringify(payload)]
        )

        const analyticData = payload.Analytic_Data
        if (Array.isArray(analyticData)) {
            for (const event of analyticData) {
                const eventTime = event.Timestamp || new Date();

                if (event.Direction_IN > 0) {
                    await dbPromise.query(
                        'INSERT INTO people_count_events (camera_id, zone_id, direction, count, event_time, tenant_id) VALUES (?, ?, "IN", ?, ?, ?)',
                        [internalId, zoneId, event.Direction_IN, eventTime, tenantId]
                    )
                }
                if (event.Direction_OUT > 0) {
                    await dbPromise.query(
                        'INSERT INTO people_count_events (camera_id, zone_id, direction, count, event_time, tenant_id) VALUES (?, ?, "OUT", ?, ?, ?)',
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
        console.log(`🚀 Servidor rodando em http://localhost:${PORT}`)
        console.log(`✅ Banco de dados conectado com sucesso`)
    } catch (e) {
        console.error('❌ Erro crítico ao iniciar:', e.message)
        process.exit(1)
    }
})