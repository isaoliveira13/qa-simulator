// Hash e verificação de senha usando scrypt do módulo nativo `crypto` do Node —
// sem dependência externa. A senha NUNCA é guardada em texto puro: guardamos
// apenas "salt:hash". A verificação é feita em tempo constante (timingSafeEqual).
const { scrypt, randomBytes, timingSafeEqual } = require('crypto');

const KEYLEN = 64;

function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = randomBytes(16).toString('hex');
    scrypt(String(password), salt, KEYLEN, (err, derived) => {
      if (err) return reject(err);
      resolve(salt + ':' + derived.toString('hex'));
    });
  });
}

function verifyPassword(password, stored) {
  return new Promise((resolve) => {
    if (!stored || typeof stored !== 'string' || !stored.includes(':')) return resolve(false);
    const [salt, key] = stored.split(':');
    let keyBuf;
    try { keyBuf = Buffer.from(key, 'hex'); } catch (e) { return resolve(false); }
    scrypt(String(password), salt, KEYLEN, (err, derived) => {
      if (err) return resolve(false);
      if (derived.length !== keyBuf.length) return resolve(false);
      resolve(timingSafeEqual(derived, keyBuf));
    });
  });
}

module.exports = { hashPassword, verifyPassword };
