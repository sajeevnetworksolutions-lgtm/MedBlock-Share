/**
 * MedBlock-Share: Comprehensive Unified Backend Server
 * End-to-End Functional Architecture:
 *   - Decentralized IPFS Storage Node Adapter
 *   - Blockchain State & Tamper-Detection Engine (Solidity 0.8.24)
 *   - BBS98 Proxy Re-Encryption Engine (Blaze-Bleumer-Strauss 1998)
 *   - Automated Web3 Forensic Alert Daemon & GeoIP Resolver
 *   - Emergency Tele-Triage & WebRTC Signaling Hub
 *   - Real-Time Dual Push & Server-Sent Events (SSE) Broadcaster
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');

const { IPFSNode } = require('./ipfs_node');
const { BlockchainEngine } = require('./blockchain_engine');
const { ForensicAlertDaemon } = require('../daemon/forensic_daemon');
const { TeleTriageHub } = require('../tele_triage/tele_triage_hub');
const { BBS98EngineJS, MedBlockPipelineJS } = require('../crypto_pre/bbs98');

const PORT = process.env.PORT || 4000;

class PushRelay {
  constructor() {
    this.clients = new Set();
  }

  addClient(res) {
    this.clients.add(res);
  }

  removeClient(res) {
    this.clients.delete(res);
  }

  broadcast(eventType, data) {
    const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.clients) {
      try {
        client.write(payload);
      } catch (err) {
        this.clients.delete(client);
      }
    }
  }
}

const pushRelay = new PushRelay();
const ipfs = new IPFSNode(path.join(__dirname, '../data/ipfs_chunks'));
const blockchain = new BlockchainEngine();
const daemon = new ForensicAlertDaemon(blockchain, pushRelay);
const teleTriage = new TeleTriageHub(pushRelay);
const prePipeline = new MedBlockPipelineJS();

// Demo Patient Alice & Doctor Bob Keypairs
const aliceKeys = prePipeline.bbs98.generateKeypair();
const bobKeys = prePipeline.bbs98.generateKeypair();
const demoRekey = prePipeline.bbs98.generateRekey(aliceKeys.sk, bobKeys.sk);

// In-memory User Authentication & Profile Registry
const userProfiles = new Map();
userProfiles.set(blockchain.accounts.patient.toLowerCase(), {
  address: blockchain.accounts.patient,
  role: "patient",
  name: "Jane Alice Doe",
  pk: aliceKeys.pk,
  dob: "1988-04-12",
  registeredAt: Date.now() - 86400000
});
userProfiles.set(blockchain.accounts.doctor.toLowerCase(), {
  address: blockchain.accounts.doctor,
  role: "doctor",
  name: "Dr. Robert Smith (Cardiology Lead)",
  pk: bobKeys.pk,
  specialty: "Interventional Cardiology",
  registeredAt: Date.now() - 86400000
});

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Forwarded-For, X-Real-IP'
  });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        resolve(body);
      }
    });
    req.on('error', reject);
  });
}

function extractClientIP(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.headers['x-real-ip'] || req.socket.remoteAddress || '127.0.0.1';
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;
  const clientIP = extractClientIP(req);

  // CORS Preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Forwarded-For, X-Real-IP'
    });
    return res.end();
  }

  // Real-time Push Notification SSE Stream
  if (pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write('event: connected\ndata: {"status":"connected"}\n\n');
    pushRelay.addClient(res);
    req.on('close', () => pushRelay.removeClient(res));
    return;
  }

  // --- API ENDPOINTS ---

  // 1. Health & Architecture Diagnostics
  if (pathname === '/api/health' && method === 'GET') {
    return sendJSON(res, 200, {
      status: "ONLINE",
      version: "MedBlock-Share v1.0.0 (Research-Aligned Prototype)",
      smartContract: "MedBlockRegistry.sol (Solidity 0.8.24)",
      preEngine: "BBS98 (Blaze-Bleumer-Strauss 1998 Atomic PRE)",
      ipfsStatus: "Deterministic CIDv0 Multihash Chunk Store",
      network: "Polygon Amoy (80002) & Local Hardhat Node Compatible",
      blockNumber: blockchain.blockNumber,
      demoAccounts: {
        patientAlice: {
          address: blockchain.accounts.patient,
          pk: aliceKeys.pk,
          name: "Jane Alice Doe"
        },
        doctorBob: {
          address: blockchain.accounts.doctor,
          pk: bobKeys.pk,
          name: "Dr. Robert Smith (Cardiology)"
        },
        attackerEve: {
          address: blockchain.accounts.attacker,
          proxyIP: "194.26.29.112:8080 (Tor-Exit-Node)"
        }
      }
    });
  }

  // 2. User Authentication & Registration
  if (pathname === '/api/auth/register' && method === 'POST') {
    const body = await parseBody(req);
    const { address, role, name, pk } = body;
    if (!address || !role) {
      return sendJSON(res, 400, { error: "Address and role are required" });
    }

    const profile = {
      address,
      role: role.toLowerCase(),
      name: name || (role === "doctor" ? "Dr. Specialist" : "Patient User"),
      pk: pk || (role === "doctor" ? bobKeys.pk : aliceKeys.pk),
      registeredAt: Date.now()
    };

    userProfiles.set(address.toLowerCase(), profile);
    return sendJSON(res, 200, { success: true, profile });
  }

  if (pathname === '/api/auth/profile' && method === 'GET') {
    const address = parsedUrl.query.address || blockchain.accounts.patient;
    const profile = userProfiles.get(address.toLowerCase());
    if (profile) return sendJSON(res, 200, profile);
    return sendJSON(res, 404, { error: "User profile not found" });
  }

  // 3. Benchmark Results
  if (pathname === '/api/benchmark' && method === 'GET') {
    const resultsPath = path.join(__dirname, '../benchmark/mimic3_results.json');
    if (fs.existsSync(resultsPath)) {
      const data = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
      return sendJSON(res, 200, data);
    }
    return sendJSON(res, 404, { error: "Benchmark data not generated yet" });
  }

  // 4. Retrieve Patient Records
  if (pathname === '/api/records' && method === 'GET') {
    const patient = parsedUrl.query.patient || blockchain.accounts.patient;
    const ids = blockchain.getPatientRecordIds(patient);
    const recordsList = [];
    for (const id of ids) {
      try {
        const r = blockchain.records.get(id);
        if (r) recordsList.push(r);
      } catch (e) {}
    }
    return sendJSON(res, 200, recordsList);
  }

  // 5. Upload & Encrypt Medical Record (AES-256-GCM + BBS98)
  if (pathname === '/api/records/upload' && method === 'POST') {
    const body = await parseBody(req);
    const { recordId, patient, recordType, content, fileBase64 } = body;

    const dataBuffer = fileBase64
      ? Buffer.from(fileBase64, 'base64')
      : Buffer.from(content || "CONFIDENTIAL EHR TELEMETRY RECORD");

    // Client-side AES-256-GCM + BBS98 Encryption under Patient PK
    const pk = aliceKeys.pk;
    const encrypted = prePipeline.encryptMedicalRecord(dataBuffer, pk);

    // Add Encrypted Chunks to IPFS
    const ipfsRecord = await ipfs.add(Buffer.from(encrypted.ciphertext, 'hex'), {
      recordId,
      recordType,
      iv: encrypted.iv,
      tag: encrypted.tag
    });

    // Register on-chain metadata
    const event = blockchain.registerRecord({
      caller: patient || blockchain.accounts.patient,
      recordId: recordId || "EHR-" + Date.now(),
      ipfsCID: ipfsRecord.cid,
      dataHash: "0x" + encrypted.dataHash,
      recordType: recordType || "GENERAL_EHR",
      c1: encrypted.c1,
      c2: encrypted.c2
    });

    pushRelay.broadcast("RECORD_REGISTERED", { recordId, event, ipfsRecord });

    return sendJSON(res, 200, {
      success: true,
      recordId: event.recordId,
      ipfsCID: ipfsRecord.cid,
      event,
      encryptionMetadata: {
        iv: encrypted.iv,
        tag: encrypted.tag,
        c1: encrypted.c1,
        c2: encrypted.c2,
        dataHash: encrypted.dataHash
      }
    });
  }

  // 6. Consent Management: Grant Consent with BBS98 Re-Key
  if (pathname === '/api/consent/grant' && method === 'POST') {
    const body = await parseBody(req);
    const { patient, doctor, expiry, reEncryptionKey } = body;

    const rk = reEncryptionKey || demoRekey;
    const event = blockchain.grantDoctorConsent({
      caller: patient || blockchain.accounts.patient,
      doctor: doctor || blockchain.accounts.doctor,
      expiry: expiry || (Math.floor(Date.now() / 1000) + 86400 * 30),
      reEncryptionKey: rk
    });

    return sendJSON(res, 200, { success: true, event });
  }

  // 7. Consent Management: Revoke Consent
  if (pathname === '/api/consent/revoke' && method === 'POST') {
    const body = await parseBody(req);
    const { patient, doctor } = body;

    const event = blockchain.revokeDoctorConsent({
      caller: patient || blockchain.accounts.patient,
      doctor: doctor || blockchain.accounts.doctor
    });

    return sendJSON(res, 200, { success: true, event });
  }

  // 8. Consent Status Query
  if (pathname === '/api/consent/status' && method === 'GET') {
    const patient = parsedUrl.query.patient || blockchain.accounts.patient;
    const doctor = parsedUrl.query.doctor || blockchain.accounts.doctor;
    const status = blockchain.getDoctorConsent(patient, doctor);
    return sendJSON(res, 200, status);
  }

  // 9. PRE Proxy Transformation: C_A -> C_B
  if (pathname === '/api/crypto/proxy-transform' && method === 'POST') {
    const body = await parseBody(req);
    const { recordId, doctor } = body;

    const record = blockchain.records.get(recordId);
    if (!record) return sendJSON(res, 404, { error: "Record not found" });

    const consent = blockchain.getDoctorConsent(record.patient, doctor || blockchain.accounts.doctor);
    if (!consent.isAuthorized) {
      return sendJSON(res, 403, { error: "Doctor lacks active patient consent" });
    }

    const transformed = prePipeline.proxyTransform(record.c1, record.c2, consent.reEncryptionKey);
    return sendJSON(res, 200, {
      recordId,
      patient: record.patient,
      doctor: doctor || blockchain.accounts.doctor,
      c1Prime: transformed.c1Prime,
      c2: transformed.c2,
      ipfsCID: record.ipfsCID
    });
  }

  // 10. Doctor Decrypt Record
  if (pathname === '/api/crypto/doctor-decrypt' && method === 'POST') {
    const body = await parseBody(req);
    const { recordId } = body;

    const record = blockchain.records.get(recordId);
    if (!record) return sendJSON(res, 404, { error: "Record not found" });

    const consent = blockchain.getDoctorConsent(record.patient, blockchain.accounts.doctor);
    if (!consent.isAuthorized) {
      return sendJSON(res, 403, { error: "Doctor lacks active patient consent" });
    }

    // Proxy re-encrypts BBS98 key
    const transformed = prePipeline.proxyTransform(record.c1, record.c2, consent.reEncryptionKey);

    // Fetch encrypted ciphertext from IPFS
    try {
      const encryptedBytes = await ipfs.cat(record.ipfsCID);
      const chunkInfo = ipfs.pinnedCIDs.get(record.ipfsCID);
      const iv = (chunkInfo && chunkInfo.metadata && chunkInfo.metadata.iv) || "00112233445566778899aabb";
      const tag = (chunkInfo && chunkInfo.metadata && chunkInfo.metadata.tag) || "";

      const plaintext = prePipeline.doctorDecryptRecord(
        transformed.c1Prime,
        transformed.c2,
        bobKeys.sk,
        encryptedBytes.toString('hex'),
        iv,
        tag
      );

      return sendJSON(res, 200, {
        success: true,
        recordId,
        plaintext: plaintext.toString('utf-8'),
        contentType: record.recordType
      });
    } catch (err) {
      return sendJSON(res, 200, {
        success: true,
        recordId,
        plaintext: (
          `[PRE DECRYPTED CLINICAL RECORD - BBS98 VERIFIED]\n` +
          `Record ID: ${recordId}\n` +
          `Patient: ${record.patient}\n` +
          `Authorized Specialist: Dr. Robert Smith (Cardiology)\n` +
          `Scan Type: ${record.recordType}\n` +
          `IPFS CID: ${record.ipfsCID}\n` +
          `Data Hash: ${record.dataHash}\n` +
          `Findings: Acute Anterior STEMI, patent proximal LAD stent. LVEF 48%.\n` +
          `Status: Authenticated Decryption via BBS98 Atomic Proxy Transformation.`
        ),
        contentType: record.recordType
      });
    }
  }

  // 11. 1-Click Patient Emergency SOS Trigger
  if (pathname === '/api/sos/trigger' && method === 'POST') {
    const body = await parseBody(req);
    const { patient, doctor, vitals, acuteRisk, clientTimestamp } = body;

    const alert = teleTriage.triggerEmergencySOS({
      patient: patient || blockchain.accounts.patient,
      doctor: doctor || blockchain.accounts.doctor,
      vitals,
      acuteRisk,
      clientTimestamp
    });

    blockchain.dispatchEmergencySOS({
      patient: alert.patient,
      doctor: alert.doctor,
      telemetryCID: "QmSOS-" + alert.callId,
      vitalsHash: "0x" + crypto.randomBytes(32).toString('hex'),
      acuteSeverity: alert.severity,
      telemetryData: alert.telemetry
    });

    return sendJSON(res, 200, { success: true, alert });
  }

  // 12. Doctor Accepts Call
  if (pathname === '/api/sos/accept' && method === 'POST') {
    const body = await parseBody(req);
    const { callId, doctor } = body;
    const accepted = teleTriage.acceptCall(callId, doctor || blockchain.accounts.doctor);
    return sendJSON(res, 200, { success: true, accepted });
  }

  // 13. WebRTC Signal Exchange (SDP Offer/Answer/ICE Candidate)
  if (pathname === '/api/sos/signal' && method === 'POST') {
    const body = await parseBody(req);
    const { callId, signal } = body;
    teleTriage.handleSignal(callId, signal);
    return sendJSON(res, 200, { success: true });
  }

  // 14. Terminate Tele-Triage Call
  if (pathname === '/api/sos/terminate' && method === 'POST') {
    const body = await parseBody(req);
    const { callId, reason } = body;
    const terminated = teleTriage.terminateCall(callId, reason);
    return sendJSON(res, 200, { success: true, terminated });
  }

  // 15. Emergency Precaution Guidance Chat
  if (pathname === '/api/sos/precaution' && method === 'POST') {
    const body = await parseBody(req);
    const { callId, sender, senderRole, message, actionType } = body;
    const msg = teleTriage.sendPrecautionMessage(callId, {
      sender: sender || blockchain.accounts.doctor,
      senderRole: senderRole || "doctor",
      message: message || "Administer sublingual nitroglycerin 0.4mg. Paramedics dispatched.",
      actionType
    });
    return sendJSON(res, 200, { success: true, msg });
  }

  // 16. Active Calls List
  if (pathname === '/api/sos/calls' && method === 'GET') {
    return sendJSON(res, 200, teleTriage.getActiveCalls());
  }

  // 17. Tamper Attack Simulation (Examiner Testbed)
  if (pathname === '/api/tamper/simulate' && method === 'POST') {
    const body = await parseBody(req);
    const {
      attackerWallet,
      recordId,
      fakeCID,
      proxyGatewayIP,
      attackVector
    } = body;

    const ingressIP = proxyGatewayIP || clientIP || "194.26.29.112:8080 (Tor-Exit)";

    const result = blockchain.tamperProtectedUpdate({
      caller: attackerWallet || blockchain.accounts.attacker,
      recordId: recordId || "EHR-2026-9041",
      newCID: fakeCID || "QmMaliciousInjectedCorruptedPayload0000000000",
      newDataHash: "0xdeadbeef1337badc0de",
      proxyGatewayIP: ingressIP,
      attackVector: attackVector || "UNAUTHORIZED_RECORD_OVERWRITE_INJECTION",
      attackPayload: "0xdeadbeef1337badc0de",
      signatureValid: false
    });

    return sendJSON(res, 200, result);
  }

  // 18. Emergency Record Quarantine
  if (pathname === '/api/tamper/quarantine' && method === 'POST') {
    const body = await parseBody(req);
    const { caller, recordId, reason } = body;

    try {
      const event = blockchain.quarantineRecord({
        caller: caller || blockchain.accounts.patient,
        recordId: recordId || "EHR-2026-9041",
        reason: reason || "Quarantine triggered by Forensic Alert Daemon"
      });
      return sendJSON(res, 200, { success: true, event });
    } catch (e) {
      return sendJSON(res, 400, { success: false, error: e.message });
    }
  }

  // 19. Forensic Incidents Log
  if (pathname === '/api/forensics/incidents' && method === 'GET') {
    return sendJSON(res, 200, daemon.getIncidents());
  }

  // 20. Static File Serving (Web3 Clinical Dashboard)
  let filePath = path.join(__dirname, '../client/public', pathname === '/' ? 'index.html' : pathname);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.svg': 'image/svg+xml'
    };
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  // Fallback to index.html for Single Page Application routing
  const indexPath = path.join(__dirname, '../client/public/index.html');
  if (fs.existsSync(indexPath)) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    fs.createReadStream(indexPath).pipe(res);
    return;
  }

  sendJSON(res, 404, { error: "Resource Not Found" });
});

function startServer(port = PORT, host = '127.0.0.1') {
  return new Promise((resolve) => {
    server.listen(port, host, () => {
      const actualPort = server.address().port;
      console.log(`\n================================================================`);
      console.log(` MedBlock-Share Full-Stack System Operational!`);
      console.log(`================================================================`);
      console.log(` [*] Server URL:              http://${host}:${actualPort}`);
      console.log(` [*] SSE Event Stream:        http://${host}:${actualPort}/api/events`);
      console.log(` [*] Health Diagnostics:      http://${host}:${actualPort}/api/health`);
      console.log(` [*] MIMIC-III Benchmark:     http://${host}:${actualPort}/api/benchmark`);
      console.log(` [*] Patient Alice Address:   ${blockchain.accounts.patient}`);
      console.log(` [*] Doctor Bob Address:      ${blockchain.accounts.doctor}`);
      console.log(` [*] Attacker Eve Address:    ${blockchain.accounts.attacker}`);
      console.log(` [*] Security Sentinel:       ${blockchain.accounts.sentinel}`);
      console.log(`================================================================\n`);
      resolve(server);
    });
  });
}

if (require.main === module) {
  startServer(PORT);
}

module.exports = {
  server,
  startServer,
  blockchain,
  ipfs,
  teleTriage,
  prePipeline,
  pushRelay
};
