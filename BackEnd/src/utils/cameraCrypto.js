const crypto = require('crypto')

const ALGORITHM = 'aes-256-gcm'

function getKey() {
    const secret = process.env.CAMERA_CRED_SECRET
    if (!secret) {
        throw new Error('CAMERA_CRED_SECRET não configurado no .env')
    }
    return crypto.createHash('sha256').update(secret).digest()
}

function encrypt(plainText) {
    if (!plainText) return null

    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv)
    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()])
    const authTag = cipher.getAuthTag()

    return Buffer.concat([iv, authTag, encrypted]).toString('base64')
}

function decrypt(encoded) {
    if (!encoded) return null

    const buffer = Buffer.from(encoded, 'base64')
    const iv = buffer.subarray(0, 12)
    const authTag = buffer.subarray(12, 28)
    const encrypted = buffer.subarray(28)

    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv)
    decipher.setAuthTag(authTag)

    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}

module.exports = { encrypt, decrypt }
