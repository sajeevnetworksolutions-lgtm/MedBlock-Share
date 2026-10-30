/**
 * MedBlock-Share: BBS98 Proxy Re-Encryption Engine (JavaScript / Node.js / Browser)
 * Matches Dissertation Synopsis Section 6.1:
 *   rk_{A -> B} = (sk_B / sk_A) mod q
 *   C_A = (g^{r * sk_A} mod p, m * g^r mod p)
 *   C_B = ( (c1)^{rk_{A -> B}} mod p, c2 ) = ( g^{r * sk_B} mod p, m * g^r mod p )
 *   Doctor Decryption: g^r = (c1')^{1 / sk_B mod q} mod p => m = (c2 * (g^r)^{-1}) mod p
 */

const crypto = require('crypto');

// 257-bit Safe Prime p = 2q + 1 and Prime Subgroup Order q
const P_HEX = "1b41b6328701822e3bdcc58c1d116bc5f4f2ff624eb4a6ea2b3f7aa1a7d3bb78b";
const Q_HEX = "da0db194380c1171dee62c60e88b5e2fa797fb1275a5375159fbd50d3e9ddbc5";
const P = BigInt("0x" + P_HEX);
const Q = BigInt("0x" + Q_HEX);
const G = 4n;

// Modular exponentiation (base^exp mod mod)
function modPow(base, exp, mod) {
  let res = 1n;
  base = ((base % mod) + mod) % mod;
  exp = BigInt(exp);
  while (exp > 0n) {
    if (exp % 2n === 1n) res = (res * base) % mod;
    base = (base * base) % mod;
    exp = exp / 2n;
  }
  return res;
}

// Extended Euclidean Algorithm for modular inverse
function modInverse(a, m) {
  a = ((a % m) + m) % m;
  let [m0, y, x] = [m, 0n, 1n];
  if (m === 1n) return 0n;
  while (a > 1n) {
    let q = a / m;
    let t = m;
    m = a % m;
    a = t;
    t = y;
    y = x - q * y;
    x = t;
  }
  if (x < 0n) x += m0;
  return x;
}

// Random BigInt in range [2, max - 1]
function randBigInt(max) {
  const byteLen = Math.ceil(max.toString(16).length / 2);
  while (true) {
    const bytes = crypto.randomBytes(byteLen);
    const val = BigInt("0x" + bytes.toString('hex')) % max;
    if (val >= 2n) return val;
  }
}

class BBS98EngineJS {
  constructor(p = P, g = G, q = Q) {
    this.p = p;
    this.g = g;
    this.q = q;
  }

  generateKeypair() {
    const sk = randBigInt(this.q - 1n);
    const pk = modPow(this.g, sk, this.p);
    return {
      sk: "0x" + sk.toString(16),
      pk: "0x" + pk.toString(16)
    };
  }

  generateRekey(skAHex, skBHex) {
    const skA = BigInt(skAHex);
    const skB = BigInt(skBHex);
    const invSkA = modInverse(skA, this.q);
    const rk = (skB * invSkA) % this.q;
    return "0x" + rk.toString(16);
  }

  encrypt(pkAHex, messageBigInt) {
    const pkA = BigInt(pkAHex);
    const m = BigInt(messageBigInt);
    if (m <= 0n || m >= this.p) throw new Error("Message out of bounds [1, p-1]");

    const r = randBigInt(this.q - 1n);
    const c1 = modPow(pkA, r, this.p);
    const gR = modPow(this.g, r, this.p);
    const c2 = (m * gR) % this.p;

    return {
      c1: "0x" + c1.toString(16),
      c2: "0x" + c2.toString(16)
    };
  }

  reEncrypt(c1Hex, c2Hex, rkHex) {
    const c1 = BigInt(c1Hex);
    const c2 = BigInt(c2Hex);
    const rk = BigInt(rkHex);

    const c1Prime = modPow(c1, rk, this.p);
    return {
      c1Prime: "0x" + c1Prime.toString(16),
      c2: "0x" + c2.toString(16)
    };
  }

  decryptOriginal(c1Hex, c2Hex, skAHex) {
    const c1 = BigInt(c1Hex);
    const c2 = BigInt(c2Hex);
    const skA = BigInt(skAHex);

    const invSkA = modInverse(skA, this.q);
    const gR = modPow(c1, invSkA, this.p);
    const invGr = modInverse(gR, this.p);
    const m = (c2 * invGr) % this.p;
    return "0x" + m.toString(16);
  }

  decryptReEncrypted(c1PrimeHex, c2Hex, skBHex) {
    const c1Prime = BigInt(c1PrimeHex);
    const c2 = BigInt(c2Hex);
    const skB = BigInt(skBHex);

    const invSkB = modInverse(skB, this.q);
    const gR = modPow(c1Prime, invSkB, this.p);
    const invGr = modInverse(gR, this.p);
    const m = (c2 * invGr) % this.p;
    return "0x" + m.toString(16);
  }
}

// Hybrid AES-256-GCM Envelope Encryption
class MedBlockPipelineJS {
  constructor() {
    this.bbs98 = new BBS98EngineJS();
  }

  encryptMedicalRecord(buffer, pkHex) {
    let dek = crypto.randomBytes(32);
    let dekBigInt = BigInt("0x" + dek.toString('hex'));
    while (dekBigInt === 0n || dekBigInt >= this.bbs98.q) {
      dek = crypto.randomBytes(32);
      dekBigInt = BigInt("0x" + dek.toString('hex'));
    }

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);
    const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);
    const tag = cipher.getAuthTag();

    const { c1, c2 } = this.bbs98.encrypt(pkHex, dekBigInt);
    const dataHash = crypto.createHash('sha256').update(ciphertext).digest('hex');

    return {
      ciphertext: ciphertext.toString('hex'),
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
      dataHash,
      c1,
      c2,
      fileSize: buffer.length
    };
  }

  proxyTransform(c1, c2, rk) {
    return this.bbs98.reEncrypt(c1, c2, rk);
  }

  doctorDecryptRecord(c1Prime, c2, skBHex, ciphertextHex, ivHex, tagHex) {
    const dekHexRaw = this.bbs98.decryptReEncrypted(c1Prime, c2, skBHex);
    let cleanHex = dekHexRaw.replace(/^0x/, '');
    while (cleanHex.length < 64) cleanHex = '0' + cleanHex;
    const dek = Buffer.from(cleanHex, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', dek, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextHex, 'hex')),
      decipher.final()
    ]);
    return plaintext;
  }
}

module.exports = {
  BBS98EngineJS,
  MedBlockPipelineJS,
  P,
  Q,
  G
};

if (require.main === module) {
  const pipeline = new MedBlockPipelineJS();
  const alice = pipeline.bbs98.generateKeypair();
  const bob = pipeline.bbs98.generateKeypair();
  const rk = pipeline.bbs98.generateRekey(alice.sk, bob.sk);

  const sampleData = Buffer.from("MEDBLOCK EHR: Patient Jane Doe - Cardiac telemetry normal.");
  const enc = pipeline.encryptMedicalRecord(sampleData, alice.pk);
  const re = pipeline.proxyTransform(enc.c1, enc.c2, rk);
  const dec = pipeline.doctorDecryptRecord(re.c1Prime, re.c2, bob.sk, enc.ciphertext, enc.iv, enc.tag);

  console.log("[JS BBS98 TEST] Decrypted string:", dec.toString('utf-8'));
  console.log("[JS BBS98 TEST] Decryption Match:", dec.toString('utf-8') === sampleData.toString('utf-8'));
}
