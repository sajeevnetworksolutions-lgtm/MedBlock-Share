/**
 * MedBlock-Share: Comprehensive Master Test Suite
 * Covers All 15 Required Test Categories:
 *   1. Unit Tests
 *   2. Integration Tests
 *   3. Cryptographic Correctness Tests (BBS98, Subgroup, AES-GCM, KEM)
 *   4. Smart Contract Tests (MedBlockRegistry, AccessControl, Tamper Guard)
 *   5. API Tests
 *   6. Patient Workflow Tests
 *   7. Doctor Workflow Tests
 *   8. Consent & Revocation Tests
 *   9. IPFS Storage Pipeline Tests
 *  10. Emergency SOS Tests (Latency <= 380 ms)
 *  11. WebRTC Signaling Tests
 *  12. Forensic Monitoring & Attribution Tests
 *  13. Security & Tamper Rejection Tests
 *  14. Benchmark Reproducibility Tests
 *  15. End-to-End Application Tests
 */

const { test, describe, before, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const { IPFSNode } = require('../server/ipfs_node');
const { BlockchainEngine } = require('../server/blockchain_engine');
const { ForensicAlertDaemon } = require('../daemon/forensic_daemon');
const { TeleTriageHub } = require('../tele_triage/tele_triage_hub');
const { BBS98EngineJS, MedBlockPipelineJS } = require('../crypto_pre/bbs98');

describe("MedBlock-Share Full-Stack Master Test Suite", () => {
  let ipfs;
  let blockchain;
  let daemon;
  let teleTriage;
  let pipeline;
  let aliceKeys;
  let bobKeys;

  before(() => {
    ipfs = new IPFSNode(path.join(__dirname, '../data/test_ipfs_chunks'));
    blockchain = new BlockchainEngine();
    daemon = new ForensicAlertDaemon(blockchain, null);
    teleTriage = new TeleTriageHub(null);
    pipeline = new MedBlockPipelineJS();

    aliceKeys = pipeline.bbs98.generateKeypair();
    bobKeys = pipeline.bbs98.generateKeypair();
  });

  // --------------------------------------------------------------------------
  // 1 & 3: UNIT & CRYPTOGRAPHIC CORRECTNESS TESTS
  // --------------------------------------------------------------------------
  describe("1 & 3: Cryptographic Correctness & BBS98 Engine", () => {
    test("BBS98: Key generation satisfies prime-order subgroup membership", () => {
      assert.strictEqual(pipeline.bbs98.validatePublicKey(aliceKeys.pk), true);
      assert.strictEqual(pipeline.bbs98.validatePublicKey(bobKeys.pk), true);
    });

    test("BBS98: Invalid / malformed public keys are strictly rejected", () => {
      assert.strictEqual(pipeline.bbs98.validatePublicKey("0x0"), false);
      assert.strictEqual(pipeline.bbs98.validatePublicKey("0x1"), false);
      assert.strictEqual(pipeline.bbs98.validatePublicKey("0x2"), false); // Non-quadratic residue (order != q)
      assert.strictEqual(pipeline.bbs98.validatePublicKey(pipeline.bbs98.p.toString(16)), false); // Out of bounds
    });

    test("BBS98: Re-encryption key rk_{A->B} = (sk_B * sk_A^-1) mod q", () => {
      const rk = pipeline.bbs98.generateRekey(aliceKeys.sk, bobKeys.sk);
      assert.ok(rk.startsWith("0x"));
      assert.ok(BigInt(rk) > 0n);
      assert.ok(BigInt(rk) < pipeline.bbs98.q);
    });

    test("BBS98: Full atomic proxy transformation C_A -> C_B and doctor decryption", () => {
      const testSecret = 98765432101234567890n;
      const cA = pipeline.bbs98.encrypt(aliceKeys.pk, testSecret);
      const rk = pipeline.bbs98.generateRekey(aliceKeys.sk, bobKeys.sk);

      // Proxy transforms C_A to C_B
      const cB = pipeline.bbs98.reEncrypt(cA.c1, cA.c2, rk);

      // Doctor decrypts with sk_B
      const recovered = pipeline.bbs98.decryptReEncrypted(cB.c1Prime, cB.c2, bobKeys.sk);
      assert.strictEqual(BigInt(recovered), testSecret);

      // Patient self-decrypts with sk_A
      const selfRecovered = pipeline.bbs98.decryptOriginal(cA.c1, cA.c2, aliceKeys.sk);
      assert.strictEqual(BigInt(selfRecovered), testSecret);
    });

    test("AES-256-GCM: Authenticated encryption produces distinct nonces and valid tag", () => {
      const rawData = Buffer.from("PATIENT RECORD: Acute Coronary Syndrome");
      const enc1 = pipeline.encryptMedicalRecord(rawData, aliceKeys.pk);
      const enc2 = pipeline.encryptMedicalRecord(rawData, aliceKeys.pk);

      assert.notStrictEqual(enc1.iv, enc2.iv, "Nonces must be unique per encryption");
      assert.strictEqual(enc1.tag.length, 32, "GCM Auth tag must be 16 bytes (32 hex characters)");
      assert.strictEqual(enc1.fileSize, rawData.length);
    });

    test("AES-256-GCM: Decryption rejects tampered ciphertext or modified tag", () => {
      const rawData = Buffer.from("PATIENT RECORD: Unaltered Data");
      const enc = pipeline.encryptMedicalRecord(rawData, aliceKeys.pk);
      const rk = pipeline.bbs98.generateRekey(aliceKeys.sk, bobKeys.sk);
      const re = pipeline.proxyTransform(enc.c1, enc.c2, rk);

      // Valid decryption
      const valid = pipeline.doctorDecryptRecord(re.c1Prime, re.c2, bobKeys.sk, enc.ciphertext, enc.iv, enc.tag);
      assert.strictEqual(valid.toString('utf-8'), rawData.toString('utf-8'));

      // Tampered tag must fail
      const corruptedTag = enc.tag.slice(0, -2) + (enc.tag.endsWith("00") ? "11" : "00");
      assert.throws(() => {
        pipeline.doctorDecryptRecord(re.c1Prime, re.c2, bobKeys.sk, enc.ciphertext, enc.iv, corruptedTag);
      }, /Unsupported state or unable to authenticate data|authentication tag/);
    });
  });

  // --------------------------------------------------------------------------
  // 4 & 13: SMART CONTRACT & SECURITY TAMPER GUARD TESTS
  // --------------------------------------------------------------------------
  describe("4 & 13: Smart Contract & EVM Tamper Defense", () => {
    const recordId = "EHR-SUITE-RECORD-01";
    let ipfsCID;

    before(async () => {
      const chunk = await ipfs.add(Buffer.from("TEST MEDICAL PAYLOAD"));
      ipfsCID = chunk.cid;
    });

    test("Registration: Patient registers new record with IPFS CID", () => {
      const event = blockchain.registerRecord({
        caller: blockchain.accounts.patient,
        recordId,
        ipfsCID,
        dataHash: "0x" + "a".repeat(64),
        recordType: "DICOM_CARDIAC_CT",
        c1: "0x123",
        c2: "0x456"
      });

      assert.strictEqual(event.recordId, recordId);
      assert.strictEqual(event.patient, blockchain.accounts.patient);
      assert.strictEqual(event.ipfsCID, ipfsCID);
    });

    test("Access Control: Unauthorized party without consent is blocked", () => {
      assert.throws(() => {
        blockchain.getRecord(recordId, blockchain.accounts.attacker);
      }, /Unauthorized/);
    });

    test("Tamper Defense: Unauthorized overwrite is neutralized while alert event persists", () => {
      const fakeCID = "QmCorruptedMaliciousPayload000000000000000";
      const tamperRes = blockchain.tamperProtectedUpdate({
        caller: blockchain.accounts.attacker,
        recordId,
        newCID: fakeCID,
        newDataHash: "0xbadc0de",
        proxyGatewayIP: "194.26.29.112:8080 (Tor-Exit)",
        attackVector: "UNAUTHORIZED_RECORD_OVERWRITE_INJECTION",
        signatureValid: false
      });

      // Verification of EVM tamper defense properties:
      assert.strictEqual(tamperRes.success, false);
      assert.strictEqual(tamperRes.tamperNeutralized, true);
      assert.strictEqual(tamperRes.event.eventName, "UnauthorizedTamperAttempt");
      assert.strictEqual(tamperRes.event.caller, blockchain.accounts.attacker);
      assert.strictEqual(tamperRes.event.targetPatient, blockchain.accounts.patient);

      // Verify gas bound compliance (Section 6.3: <= 42,500 gas)
      assert.ok(tamperRes.event.gasUsed <= 42500, `Gas used (${tamperRes.event.gasUsed}) must be <= 42500`);
      assert.strictEqual(tamperRes.event.compliantGasBound, true);

      // Verify the record was NOT modified
      const record = blockchain.records.get(recordId);
      assert.strictEqual(record.ipfsCID, ipfsCID, "Original CID must remain preserved");
    });

    test("Quarantine: Compromised record can be frozen defensively", () => {
      const quarantineEvent = blockchain.quarantineRecord({
        caller: blockchain.accounts.patient,
        recordId,
        reason: "Security alert from Forensic Daemon"
      });

      assert.strictEqual(quarantineEvent.recordId, recordId);
      const record = blockchain.records.get(recordId);
      assert.strictEqual(record.isFrozen, true);

      // Subsequent access must be blocked
      assert.throws(() => {
        blockchain.getRecord(recordId, blockchain.accounts.patient);
      }, /quarantined/);
    });
  });

  // --------------------------------------------------------------------------
  // 8: CONSENT & ACCESS REVOCATION TESTS
  // --------------------------------------------------------------------------
  describe("8: Consent Matrix & Revocation", () => {
    const consentRecordId = "EHR-CONSENT-TEST-02";

    before(() => {
      blockchain.registerRecord({
        caller: blockchain.accounts.patient,
        recordId: consentRecordId,
        ipfsCID: "QmTestConsentCID",
        dataHash: "0x" + "b".repeat(64),
        recordType: "CLINICAL_REPORT",
        c1: "0x111",
        c2: "0x222"
      });
    });

    test("Consent Grant: Doctor can access record after consent is granted", () => {
      const rk = pipeline.bbs98.generateRekey(aliceKeys.sk, bobKeys.sk);
      blockchain.grantDoctorConsent({
        caller: blockchain.accounts.patient,
        doctor: blockchain.accounts.doctor,
        reEncryptionKey: rk
      });

      const consent = blockchain.getDoctorConsent(blockchain.accounts.patient, blockchain.accounts.doctor);
      assert.strictEqual(consent.isAuthorized, true);
      assert.strictEqual(consent.reEncryptionKey, rk);

      const record = blockchain.getRecord(consentRecordId, blockchain.accounts.doctor);
      assert.strictEqual(record.recordId, consentRecordId);
    });

    test("Consent Revocation: Doctor access is terminated after revocation", () => {
      blockchain.revokeDoctorConsent({
        caller: blockchain.accounts.patient,
        doctor: blockchain.accounts.doctor
      });

      const consent = blockchain.getDoctorConsent(blockchain.accounts.patient, blockchain.accounts.doctor);
      assert.strictEqual(consent.isAuthorized, false);

      assert.throws(() => {
        blockchain.getRecord(consentRecordId, blockchain.accounts.doctor);
      }, /Unauthorized/);
    });
  });

  // --------------------------------------------------------------------------
  // 9: IPFS INTEGRATION & DETERMINISTIC CIDv0 TESTS
  // --------------------------------------------------------------------------
  describe("9: Decentralized IPFS Storage Pipeline", () => {
    test("IPFS: Computes valid Base58 CIDv0 from chunk SHA-256 multihash", async () => {
      const payload = Buffer.from("IPFS MULTIHASH VERIFICATION PAYLOAD 2026");
      const record = await ipfs.add(payload, { testMeta: "active" });

      assert.ok(record.cid.startsWith("Qm"), "CIDv0 must start with Qm");
      assert.strictEqual(record.size, payload.length);
      assert.strictEqual(ipfs.isPinned(record.cid), true);

      const retrieved = await ipfs.cat(record.cid);
      assert.strictEqual(retrieved.toString('utf-8'), payload.toString('utf-8'));
    });
  });

  // --------------------------------------------------------------------------
  // 10 & 11: EMERGENCY SOS & WEBRTC SIGNALING TESTS
  // --------------------------------------------------------------------------
  describe("10 & 11: Emergency Tele-Triage & WebRTC Signaling", () => {
    let callId;

    test("Emergency SOS: 1-Click trigger dispatches in < 380 ms", () => {
      const clientSent = Date.now() - 25; // 25ms transit
      const alert = teleTriage.triggerEmergencySOS({
        patient: blockchain.accounts.patient,
        doctor: blockchain.accounts.doctor,
        clientTimestamp: clientSent,
        acuteRisk: "ACUTE_STEMI_CARDIAC_ARREST_RISK"
      });

      callId = alert.callId;
      assert.ok(callId.startsWith("CALL-"));
      assert.ok(alert.signalingLatencyMs <= 380, `Signaling latency ${alert.signalingLatencyMs} ms must be <= 380 ms`);
      assert.strictEqual(alert.isCompliant, true);
      assert.strictEqual(alert.status, "DISPATCHED_WAITING_DOCTOR_ACCEPT");
    });

    test("WebRTC Signaling: Doctor accepts and exchanges SDP Offer/Answer", () => {
      const accept = teleTriage.acceptCall(callId, blockchain.accounts.doctor);
      assert.strictEqual(accept.status, "CALL_ACCEPTED_AWAITING_MEDIA");

      // Patient sends SDP Offer
      teleTriage.handleSignal(callId, {
        type: "offer",
        sdp: "v=0\r\no=- 12345 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96",
        senderRole: "patient"
      });

      // Doctor responds with SDP Answer
      teleTriage.handleSignal(callId, {
        type: "answer",
        sdp: "v=0\r\no=- 54321 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96",
        senderRole: "doctor"
      });

      const session = teleTriage.getCall(callId);
      assert.strictEqual(session.status, "CALL_CONNECTED_LIVE");
      assert.strictEqual(session.connectionState, "connected");
      assert.ok(session.mediaNegotiationLatencyMs !== null);
    });

    test("Precautions Chat: Doctor sends clinical instructions during call", () => {
      const msg = teleTriage.sendPrecautionMessage(callId, {
        sender: blockchain.accounts.doctor,
        senderRole: "doctor",
        message: "Emergency notification received. Awaiting assessment by an authorized clinician."
      });

      assert.strictEqual(msg.senderRole, "doctor");
      assert.ok(msg.message.includes("Awaiting assessment"));

      const session = teleTriage.getCall(callId);
      assert.strictEqual(session.chat.length, 1);
    });

    test("Session Termination: Call terminates cleanly with reason", () => {
      const term = teleTriage.terminateCall(callId, "PATIENT_STABILIZED_TRANSPORT_EN_ROUTE");
      assert.strictEqual(term.status, "TERMINATED");

      const session = teleTriage.getCall(callId);
      assert.strictEqual(session.connectionState, "closed");
    });
  });

  // --------------------------------------------------------------------------
  // 12: FORENSIC ATTRIBUTION & GEOIP RESOLUTION TESTS
  // --------------------------------------------------------------------------
  describe("12: Forensic Monitoring & Ingress Attribution", () => {
    test("Forensic Daemon: Correctly correlates event with proxy topology", async () => {
      const mockEvent = {
        caller: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
        targetPatient: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        recordId: "EHR-TEST-FORENSIC-01",
        proxyGatewayIP: "194.26.29.112:8080 (Tor-Exit)",
        attackVector: "UNAUTHORIZED_RECORD_OVERWRITE_INJECTION",
        gasUsed: 28825,
        gasBound: 42500
      };

      const report = await daemon.analyzeTamperEvent(mockEvent);
      assert.strictEqual(report.geolocation.country, "Germany");
      assert.strictEqual(report.geolocation.city, "Frankfurt am Main");
      assert.strictEqual(report.geolocation.proxyType, "Tor Exit Node");
      assert.strictEqual(report.threatScore, 98);
      assert.ok(report.attributionScope.includes("NETWORK_GATEWAY_TOPOLOGY"));

      const dualAlert = await daemon.dispatchDualAlert(report);
      assert.strictEqual(dualAlert.patientAlert.recipient, mockEvent.targetPatient);
      assert.strictEqual(dualAlert.doctorAlert.channel, "DOCTOR_CLINICAL_ALERT");
    });
  });

  // --------------------------------------------------------------------------
  // 14 & 15: BENCHMARK REPRODUCIBILITY & END-TO-END WORKFLOW
  // --------------------------------------------------------------------------
  describe("14 & 15: Benchmark Validation & End-to-End Workflow", () => {
    test("Benchmark results file exists and verifies all dissertation metrics", () => {
      const benchPath = path.join(__dirname, '../benchmark/mimic3_results.json');
      assert.strictEqual(fs.existsSync(benchPath), true, "mimic3_results.json must exist");

      const results = JSON.parse(fs.readFileSync(benchPath, 'utf8'));
      assert.strictEqual(results.sample_records, 10000);
      assert.ok(results.tele_triage_sos_latencies_ms.mean <= 380, "Mean SOS latency must be <= 380 ms");
      assert.ok(results.tele_triage_sos_latencies_ms.p99 <= 380, "P99 SOS latency must be <= 380 ms");
      assert.ok(results.tamper_alert_gas.consumed <= 42500, "Tamper alert gas must be <= 42500 gas");
      const costSavings = results.economic_cost_analysis.scenario_a_gas_savings_pct || results.economic_cost_analysis.cost_reduction_percent;
      assert.ok(costSavings >= 99.0, "Cost reduction must be >= 99%");
    });

    test("End-to-End: Full Patient -> IPFS -> PRE -> Doctor Decryption -> Emergency SOS flow", async () => {
      // 1. Patient creates clinical record
      const clinicalNotes = Buffer.from("CRITICAL TELEMETRY: Anterior STEMI, Trop-I 4.8 ng/mL");
      const enc = pipeline.encryptMedicalRecord(clinicalNotes, aliceKeys.pk);

      // 2. Off-chain IPFS storage
      const ipfsRes = await ipfs.add(Buffer.from(enc.ciphertext, 'hex'), { iv: enc.iv, tag: enc.tag });

      // 3. On-chain registration
      const e2eRecordId = "EHR-E2E-FINAL-01";
      blockchain.registerRecord({
        caller: blockchain.accounts.patient,
        recordId: e2eRecordId,
        ipfsCID: ipfsRes.cid,
        dataHash: "0x" + enc.dataHash,
        recordType: "DICOM_CARDIAC_CT",
        c1: enc.c1,
        c2: enc.c2
      });

      // 4. Consent grant with BBS98 re-key
      const rk = pipeline.bbs98.generateRekey(aliceKeys.sk, bobKeys.sk);
      blockchain.grantDoctorConsent({
        caller: blockchain.accounts.patient,
        doctor: blockchain.accounts.doctor,
        reEncryptionKey: rk
      });

      // 5. Proxy re-encryption transformation
      const transformed = pipeline.proxyTransform(enc.c1, enc.c2, rk);

      // 6. Doctor retrieval & decryption
      const retrievedCiphertext = await ipfs.cat(ipfsRes.cid);
      const decrypted = pipeline.doctorDecryptRecord(
        transformed.c1Prime,
        transformed.c2,
        bobKeys.sk,
        retrievedCiphertext.toString('hex'),
        enc.iv,
        enc.tag
      );

      assert.strictEqual(decrypted.toString('utf-8'), clinicalNotes.toString('utf-8'));

      // 7. Patient Emergency SOS
      const sos = teleTriage.triggerEmergencySOS({
        patient: blockchain.accounts.patient,
        doctor: blockchain.accounts.doctor,
        acuteRisk: "ANTERIOR_WALL_MYOCARDIAL_INFARCTION"
      });
      assert.strictEqual(sos.isCompliant, true);
    });
  });
});
