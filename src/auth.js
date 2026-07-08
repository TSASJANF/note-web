const crypto = require('crypto');

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, keyLength: 64 };

function hashPassword(password, salt = crypto.randomBytes(16).toString('base64url')) {
    const key = crypto.scryptSync(password, salt, SCRYPT_PARAMS.keyLength, {
        N: SCRYPT_PARAMS.N,
        r: SCRYPT_PARAMS.r,
        p: SCRYPT_PARAMS.p
    });
    return `scrypt$${SCRYPT_PARAMS.N}$${SCRYPT_PARAMS.r}$${SCRYPT_PARAMS.p}$${salt}$${key.toString('base64url')}`;
}

function verifyPassword(password, encodedHash) {
    if (!password || !encodedHash) {
        return false;
    }

    const parts = encodedHash.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') {
        return false;
    }

    const [, rawN, rawR, rawP, salt, expected] = parts;
    const key = crypto.scryptSync(password, salt, Buffer.from(expected, 'base64url').length, {
        N: Number(rawN),
        r: Number(rawR),
        p: Number(rawP)
    }).toString('base64url');

    const expectedBuffer = Buffer.from(expected, 'base64url');
    const actualBuffer = Buffer.from(key, 'base64url');
    return expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

module.exports = { hashPassword, verifyPassword };
