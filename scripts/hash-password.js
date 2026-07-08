#!/usr/bin/env node
const { hashPassword } = require('../src/auth');

const password = process.argv[2];
if (!password) {
    console.error('Usage: node scripts/hash-password.js <password>');
    process.exit(1);
}

console.log(hashPassword(password));
