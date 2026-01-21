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
    database: process.env.DB_NAME
})

const dbPromise = db.promise()

app.use(cors({
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}))

app.use(express.json())

const baseDir = path.join(__dirname, '..')

app.use(express.static(baseDir))

const apiRouter = require('./apiRouter')
app.use('/api', apiRouter(dbPromise))

app.post('/vivotek/push', async (req, res) => {
    const payload = req.body
    const cameraSerial = payload.Device_ID || 'Desconhecido'
    try {
        const [rows] = await dbPromise.query(
            'SELECT id FROM cameras WHERE camera_id = ?',
            [cameraSerial]
        )
        let internalId
        if (rows.length > 0) {
            internalId = rows[0].id
        } else {
            const [result] = await dbPromise.query(
                'INSERT INTO cameras (camera_id, name) VALUES (?, ?)',
                [cameraSerial, `Câmera ${cameraSerial}`]
            )
            internalId = result.insertId
        }
        await dbPromise.query(
            'INSERT INTO raw_payloads (camera_id, raw_json) VALUES (?, ?)',
            [internalId, JSON.stringify(payload)]
        )
        res.sendStatus(200)
    } catch (err) {
        res.status(500).send(err.message)
    }
})

app.get('/', (req, res) => {
    res.sendFile(path.join(baseDir, 'home.html'))
})

const PORT = 3000

app.listen(PORT, '0.0.0.0', async () => {
    try {
        await dbPromise.query('SELECT 1')
        console.log(`Servidor rodando em http://localhost:${PORT}`)
    } catch (e) {
        console.error('Erro ao conectar ao banco:', e.message)
        process.exit(1)
    }
})