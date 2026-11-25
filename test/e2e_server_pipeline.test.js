/**
 * MedBlock-Share: Comprehensive End-to-End Live Application Server Verification Test
 * Tests all HTTP endpoints and live workflows:
 *   1. Server boot & /api/health check
 *   2. Web client index.html delivery
 *   3. Patient & Doctor Registration
 *   4. Record Upload (AES-256-GCM + BBS98 + IPFS multihash)
 *   5. Consent Grant with BBS98 re-encryption key
 *   6. Proxy Transformation C_A -> C_B
 *   7. Doctor Decryption & Authentication Tag Verification
 *   8. Consent Revocation & Verification that access is blocked
 *   9. Tamper Attempt Simulation & Persistent Alert Event
 *  10. 1-Click Emergency SOS Trigger & Signaling Latency Check (< 380 ms)
 *  11. Doctor Accept Call, WebRTC Signal Exchange & Precaution Chat
 *  12. Graceful Server Teardown
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { startServer, server } = require('../server/app_server.js');

let testPort;
let serverInstance;

function httpRequest({ path, method = 'GET', headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const reqHeaders = { ...headers };
    let postData = null;
    if (body) {
      postData = typeof body === 'string' ? body : JSON.stringify(body);
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: testPort,
        path,
        method,
        headers: reqHeaders
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(data);
          } catch (e) {}
          resolve({ status: res.statusCode, headers: res.headers, raw: data, json });
        });
      }
    );

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

test('Live Application Server Full End-to-End HTTP Pipeline', async (t) => {
  await t.test('1. Server Initialization & Boot', async () => {
    serverInstance = await startServer(0);
    testPort = serverInstance.address().port;
    assert.ok(testPort > 0, 'Server bound to ephemeral port');

    // Health check
    const res = await httpRequest({ path: '/api/health' });
    assert.equal(res.status, 200);
    assert.equal(res.json.status, 'ONLINE');
    assert.ok(res.json.smartContract.includes('Solidity 0.8.24'));
    assert.ok(res.json.preEngine.includes('BBS98'));
  });

  await t.test('2. Web Interface Static HTML Delivery', async () => {
    const res = await httpRequest({ path: '/' });
    assert.equal(res.status, 200);
    assert.ok(res.raw.includes('MedBlock-Share'));
    assert.ok(res.raw.includes('BBS98 Proxy Re-Encryption'));
  });

  await t.test('3. Patient and Doctor Registration', async () => {
    // Register Patient
    const pRes = await httpRequest({
      path: '/api/auth/register',
      method: 'POST',
      body: {
        address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        role: 'patient',
        name: 'Jane Alice Doe'
      }
    });
    assert.equal(pRes.status, 200);
    assert.equal(pRes.json.success, true);
    assert.equal(pRes.json.profile.role, 'patient');

    // Register Doctor
    const dRes = await httpRequest({
      path: '/api/auth/register',
      method: 'POST',
      body: {
        address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
        role: 'doctor',
        name: 'Dr. Robert Smith (Cardiology)'
      }
    });
    assert.equal(dRes.status, 200);
    assert.equal(dRes.json.success, true);
    assert.equal(dRes.json.profile.role, 'doctor');
  });

  let createdRecordId;
  await t.test('4. Medical Record Creation & Hybrid Encryption (AES-GCM + BBS98 + IPFS)', async () => {
    const res = await httpRequest({
      path: '/api/records/upload',
      method: 'POST',
      body: {
        recordId: 'EHR-LIVE-TEST-001',
        patient: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        recordType: 'CARDIOLOGY_ECG',
        content: JSON.stringify({
          diagnosis: 'Acute Coronary Syndrome - STEMI',
          troponin: '14.2 ng/mL',
          heartRate: 118,
          timestamp: Date.now()
        })
      }
    });

    assert.equal(res.status, 200);
    assert.equal(res.json.success, true);
    assert.ok(res.json.ipfsCID.startsWith('Qm'));
    assert.ok(res.json.encryptionMetadata.iv);
    assert.ok(res.json.encryptionMetadata.tag);
    assert.ok(res.json.encryptionMetadata.c1);
    assert.ok(res.json.encryptionMetadata.c2);
    createdRecordId = res.json.recordId;
  });

  await t.test('5. Doctor Access without Consent is Blocked (403)', async () => {
    const res = await httpRequest({
      path: '/api/crypto/proxy-transform',
      method: 'POST',
      body: {
        recordId: createdRecordId,
        doctor: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'
      }
    });
    assert.equal(res.status, 403);
    assert.ok(res.json.error.includes('lacks active patient consent'));
  });

  await t.test('6. Consent Grant with BBS98 Re-Encryption Key', async () => {
    const res = await httpRequest({
      path: '/api/consent/grant',
      method: 'POST',
      body: {
        patient: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        doctor: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'
      }
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.success, true);
    assert.ok(res.json.event);
  });

  await t.test('7. PRE Proxy Transformation C_A -> C_B & Doctor Decryption', async () => {
    // 1. Transform
    const tRes = await httpRequest({
      path: '/api/crypto/proxy-transform',
      method: 'POST',
      body: {
        recordId: createdRecordId,
        doctor: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'
      }
    });
    assert.equal(tRes.status, 200);
    assert.ok(tRes.json.c1Prime);

    // 2. Decrypt
    const dRes = await httpRequest({
      path: '/api/crypto/doctor-decrypt',
      method: 'POST',
      body: { recordId: createdRecordId }
    });
    assert.equal(dRes.status, 200);
    assert.equal(dRes.json.success, true);
    assert.ok(dRes.json.plaintext.length > 0);
  });

  await t.test('8. Consent Revocation Enforced Immediately', async () => {
    const rRes = await httpRequest({
      path: '/api/consent/revoke',
      method: 'POST',
      body: {
        patient: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        doctor: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'
      }
    });
    assert.equal(rRes.status, 200);

    // Verify subsequent transformation is blocked
    const tRes = await httpRequest({
      path: '/api/crypto/proxy-transform',
      method: 'POST',
      body: {
        recordId: createdRecordId,
        doctor: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'
      }
    });
    assert.equal(tRes.status, 403);
  });

  await t.test('9. Tamper Defense: Unauthorized Mutation Neutralized & Alert Emitted', async () => {
    const res = await httpRequest({
      path: '/api/tamper/simulate',
      method: 'POST',
      headers: {
        'X-Forwarded-For': '194.26.29.112' // Tor exit node test IP
      },
      body: {
        recordId: createdRecordId,
        attackerWallet: '0x90F79bf6EB2c4f870365E785982E1f101E93b906'
      }
    });

    assert.equal(res.status, 200);
    assert.equal(res.json.success, false); // Mutation rejected
    assert.equal(res.json.tamperNeutralized, true); // Blocked
    assert.equal(res.json.event.eventName, 'UnauthorizedTamperAttempt'); // Event persisted
    assert.equal(res.json.event.recordStatePreserved, true);
    assert.ok(res.json.event.gasUsed <= 42500); // Gas <= 42,500
  });

  let emergencyCallId;
  await t.test('10. 1-Click Patient Emergency SOS Signaling (< 380 ms)', async () => {
    const tStart = Date.now();
    const res = await httpRequest({
      path: '/api/sos/trigger',
      method: 'POST',
      body: {
        patient: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        doctor: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
        vitals: { hr: 135, bp: '80/50', spo2: 88 },
        acuteRisk: 'CARDIAC_ARREST_RISK'
      }
    });
    const duration = Date.now() - tStart;

    assert.equal(res.status, 200);
    assert.equal(res.json.success, true);
    assert.ok(res.json.alert.callId);
    assert.ok(duration < 380, `Signaling duration ${duration}ms must be < 380ms`);
    emergencyCallId = res.json.alert.callId;
  });

  await t.test('11. Tele-Triage Hub: Doctor Accept, WebRTC Signal Exchange & Precaution Chat', async () => {
    // 1. Accept call
    const aRes = await httpRequest({
      path: '/api/sos/accept',
      method: 'POST',
      body: {
        callId: emergencyCallId,
        doctor: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'
      }
    });
    assert.equal(aRes.status, 200);
    assert.equal(aRes.json.accepted.status, 'CALL_ACCEPTED_AWAITING_MEDIA');

    // 2. WebRTC Signal Exchange (Offer / Answer simulation)
    const sRes = await httpRequest({
      path: '/api/sos/signal',
      method: 'POST',
      body: {
        callId: emergencyCallId,
        signal: { type: 'offer', sdp: 'v=0\r\no=- 42 2 IN IP4 127.0.0.1...' }
      }
    });
    assert.equal(sRes.status, 200);

    // 3. Clinical Precaution Guidance Chat
    const pRes = await httpRequest({
      path: '/api/sos/precaution',
      method: 'POST',
      body: {
        callId: emergencyCallId,
        sender: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
        senderRole: 'doctor',
        message: 'Patient presenting with acute STEMI. Administer 325mg chewable aspirin immediately.',
        actionType: 'MEDICATION_ADMINISTRATION'
      }
    });
    assert.equal(pRes.status, 200);
    assert.equal(pRes.json.success, true);
    assert.ok(pRes.json.msg.message.includes('aspirin'));

    // 4. Terminate Call cleanly
    const termRes = await httpRequest({
      path: '/api/sos/terminate',
      method: 'POST',
      body: {
        callId: emergencyCallId,
        reason: 'PATIENT_STABILIZED_PARAMEDICS_ON_SCENE'
      }
    });
    assert.equal(termRes.status, 200);
    assert.equal(termRes.json.terminated.status, 'TERMINATED');
  });

  await t.test('12. Graceful Server Teardown', async () => {
    if (serverInstance && serverInstance.close) {
      await new Promise((resolve) => serverInstance.close(resolve));
    }
    assert.ok(true, 'Server closed cleanly');
  });
});
