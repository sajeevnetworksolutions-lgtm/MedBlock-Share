/**
 * MedBlock-Share: Decentralized IPFS Storage Node Adapter
 * Objective 1: Storing AES-256-GCM encrypted medical files on IPFS and CIDs on Ethereum
 * Computes deterministic IPFS CIDv0 (base58 multihash: sha256 + 0x1220 prefix)
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Base58 encoder for IPFS CIDs
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function toBase58(buffer) {
  let digits = [0];
  for (let i = 0; i < buffer.length; i++) {
    let carry = buffer[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let leadingZeros = 0;
  for (let i = 0; i < buffer.length && buffer[i] === 0; i++) {
    leadingZeros++;
  }
  let str = '';
  for (let i = 0; i < leadingZeros; i++) str += '1';
  for (let i = digits.length - 1; i >= 0; i--) {
    str += BASE58_ALPHABET[digits[i]];
  }
  return str;
}

class IPFSNode {
  constructor(storageDir) {
    this.storageDir = storageDir || path.join(__dirname, '../data/ipfs_chunks');
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
    this.pinnedCIDs = new Map();
  }

  /**
   * Generates IPFS CIDv0 for raw data: Base58(0x12, 0x20, SHA256(data))
   */
  computeCID(buffer) {
    const sha256 = crypto.createHash('sha256').update(buffer).digest();
    const multihash = Buffer.concat([Buffer.from([0x12, 0x20]), sha256]);
    return toBase58(multihash);
  }

  /**
   * Adds and pins encrypted chunk to IPFS
   */
  async add(buffer, metadata = {}) {
    const cid = this.computeCID(buffer);
    const filePath = path.join(this.storageDir, `${cid}.dat`);
    fs.writeFileSync(filePath, buffer);

    const record = {
      cid,
      size: buffer.length,
      timestamp: Date.now(),
      pinned: true,
      metadata
    };

    this.pinnedCIDs.set(cid, record);
    return record;
  }

  /**
   * Retrieves content by CID
   */
  async cat(cid) {
    const filePath = path.join(this.storageDir, `${cid}.dat`);
    if (!fs.existsSync(filePath)) {
      throw new Error(`IPFS CID not found: ${cid}`);
    }
    return fs.readFileSync(filePath);
  }

  /**
   * Check if CID is pinned
   */
  isPinned(cid) {
    const filePath = path.join(this.storageDir, `${cid}.dat`);
    return fs.existsSync(filePath);
  }
}

module.exports = { IPFSNode, toBase58 };
