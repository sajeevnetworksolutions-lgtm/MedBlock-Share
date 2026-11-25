/**
 * MedBlock-Share: Comprehensive Direct Architecture Verification
 * Validates Core Cryptographic Primitives, Storage Adapters, Access Control,
 * and Benchmark Artifacts with Genuine Assertions.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { performance } = require('perf_hooks');
const { IPFSNode } = require('../server/ipfs_node');
const { BlockchainEngine } = require('../server/blockchain_engine');
const { ForensicAlertDaemon } = require('../daemon/forensic_daemon');
const { TeleTriageHub } = require('../tele_triage/tele_triage_hub');
const { BBS98EngineJS, MedBlockPipelineJS } = require('../crypto_pre/bbs98');

async function runDirectVerification() {
  console.log("\n" + "=".repeat(80));
  console.log(" MEDBLOCK-SHARE: DIRECT ARCHITECTURE & MODULE VERIFICATION");
  console.log(" Rigorous In-Process Validation with Explicit Assertions");
  console.log("=".repeat(80) + "\n");

  try {
    // -------------------------------------------------------------
    // OBJECTIVE 1: DUAL-TIER DECENTRALIZED STORAGE ADAPTER & IPFS CIDs
    // -------------------------------------------------------------
    console.log("[*] Objective 1: Testing Client-Side AES-256-GCM + IPFS Storage Adapter Pipeline...");
    const ipfs = new IPFSNode(path.join(__dirname, '../data/ipfs_chunks'));
    const prePipeline = new MedBlockPipelineJS();

    const aliceKeys = prePipeline.bbs98.generateKeypair();
    const bobKeys = prePipeline.bbs98.generateKeypair();

    // Pure synthetic clinical test payload (no restricted patient data)
    const rawMedicalFile = Buffer.from(
      "CONFIDENTIAL HEALTH RECORD (SYNTHETIC CLINICAL DEMONSTRATION DATA)\n" +
      "Patient: Jane Alice Doe (ID: SYNTH-DEMO-90214)\n" +
      "Clinical Finding: Acute Coronary Syndrome (STEMI Anterior Wall)\n" +
      "Vitals: HR 142 bpm | BP 185/110 mmHg | SpO2 88%\n" +
      "ECG: ST segment elevation > 2mm in leads V1-V4\n" +
      "DICOM Reference: series-uid-1.2.840.113619.2.55.3"
    );

    const encRecord = prePipeline.encryptMedicalRecord(rawMedicalFile, aliceKeys.pk);
    const ipfsChunk = await ipfs.add(Buffer.from(encRecord.ciphertext, 'hex'), {
      iv: encRecord.iv,
      tag: encRecord.tag,
      dataHash: encRecord.dataHash
    });

    // Assertions for Objective 1
    assert.ok(ipfsChunk.cid, "IPFS CID must be generated");
    assert.strictEqual(typeof ipfsChunk.cid, 'string');
    assert.ok(ipfsChunk.cid.startsWith('Qm'), "IPFS CID must follow CIDv0 Base58 multihash format");
    assert.strictEqual(encRecord.ciphertext.length / 2, rawMedicalFile.length, "AES-GCM ciphertext length must match plaintext");
    assert.ok(encRecord.tag && encRecord.tag.length === 32, "AES-GCM 128-bit authentication tag (32 hex chars) required");

    console.log(`    Original Record Size:   ${rawMedicalFile.length} bytes`);
    console.log(`    AES-256-GCM Ciphertext: ${encRecord.ciphertext.length / 2} bytes`);
    console.log(`    Integrity SHA-256 Hash: 0x${encRecord.dataHash}`);
    console.log(`    Deterministic IPFS CID: ${ipfsChunk.cid}`);
    console.log(`    IPFS CID Format:        CIDv0 Base58 (Multihash sha256) -> Verified`);
    console.log("    [PASSED] Objective 1 strictly satisfied and asserted.\n");

    // -------------------------------------------------------------
    // OBJECTIVE 2: BBS98 PROXY RE-ENCRYPTION TRANSFORM & DECRYPTION
    // -------------------------------------------------------------
    console.log("[*] Objective 2: Testing BBS98 Proxy Re-Encryption Module...");
    // 1. Re-key generation: rk_{A -> B} = (sk_B / sk_A) mod q
    const rk_alice_to_bob = prePipeline.bbs98.generateRekey(aliceKeys.sk, bobKeys.sk);
    console.log(`    Patient Alice PK:       ${aliceKeys.pk.slice(0, 22)}...`);
    console.log(`    Doctor Bob PK:          ${bobKeys.pk.slice(0, 22)}...`);
    console.log(`    PRE Re-Key rk_{A->B}:   ${rk_alice_to_bob.slice(0, 22)}...`);

    // 2. Proxy re-encryption transformation: C_A -> C_B
    const transformed = prePipeline.proxyTransform(encRecord.c1, encRecord.c2, rk_alice_to_bob);
    console.log(`    Original BBS98 C1:      ${encRecord.c1.slice(0, 22)}...`);
    console.log(`    Transformed C1':        ${transformed.c1Prime.slice(0, 22)}...`);

    // 3. Doctor Bob Decryption
    const decryptedBytes = prePipeline.doctorDecryptRecord(
      transformed.c1Prime,
      transformed.c2,
      bobKeys.sk,
      encRecord.ciphertext,
      encRecord.iv,
      encRecord.tag
    );

    // Assertion for Objective 2: 100% Bit-for-Bit Decryption Match
    assert.strictEqual(
      decryptedBytes.toString('utf-8'),
      rawMedicalFile.toString('utf-8'),
      "Doctor decrypted plaintext must match original record exactly"
    );

    // Negative assertion: Attempting decryption with an invalid/unrelated key must fail
    const eveKeys = prePipeline.bbs98.generateKeypair();
    let unauthDecryptionFailed = false;
    try {
      prePipeline.doctorDecryptRecord(
        transformed.c1Prime,
        transformed.c2,
        eveKeys.sk,
        encRecord.ciphertext,
        encRecord.iv,
        encRecord.tag
      );
    } catch {
      unauthDecryptionFailed = true;
    }
    assert.ok(unauthDecryptionFailed, "Unauthorized party must not be able to decrypt with an unrelated secret key");

    console.log(`    Doctor Decryption:      SUCCESS (100% Bit-for-Bit Match Asserted)`);
    console.log(`    Unauthorized Decrypt:   REJECTED (Strict Tag/Key Validation Asserted)`);
    console.log("    [PASSED] Objective 2 strictly satisfied and asserted.\n");

    // -------------------------------------------------------------
    // OBJECTIVE 4: SMART CONTRACT TAMPER DETECTION & GAS BOUNDS
    // -------------------------------------------------------------
    console.log("[*] Objective 4: Testing Smart Contract Tamper Detection & Gas Bounds...");
    const blockchain = new BlockchainEngine();

    // Register record on-chain
    const testRecordId = "EHR-2026-DIRECT-" + Date.now();
    const regEvent = blockchain.registerRecord({
      caller: blockchain.accounts.patient,
      recordId: testRecordId,
      ipfsCID: ipfsChunk.cid,
      dataHash: "0x" + encRecord.dataHash,
      recordType: "DICOM_CARDIAC_CT_SCAN",
      c1: encRecord.c1,
      c2: encRecord.c2
    });
    assert.strictEqual(regEvent.recordId, testRecordId, "Record registration must succeed");
    console.log(`    On-Chain Record Registered: ${regEvent.recordId} (Tx: ${regEvent.txHash.slice(0, 16)}...)`);

    // Verify unauthorized access without consent is denied
    assert.throws(
      () => blockchain.getRecord(testRecordId, blockchain.accounts.attacker),
      /Unauthorized/,
      "Record access must be blocked prior to consent grant"
    );
    console.log(`    Unconsented Access Check:   BLOCKED (Unauthorized exception thrown as expected)`);

    // Grant Consent
    blockchain.grantDoctorConsent({
      caller: blockchain.accounts.patient,
      doctor: blockchain.accounts.doctor,
      reEncryptionKey: rk_alice_to_bob
    });
    console.log(`    BBS98 Consent Recorded On-Chain for Doctor ${blockchain.accounts.doctor.slice(0, 12)}...`);

    // Authorized Access Verification
    const authorizedRecord = blockchain.getRecord(testRecordId, blockchain.accounts.doctor);
    assert.ok(authorizedRecord, "Doctor must receive record after consent grant");
    assert.strictEqual(authorizedRecord.ipfsCID, ipfsChunk.cid, "Returned IPFS CID must match");
    console.log(`    Doctor Access Verification: GRANTED (CID: ${authorizedRecord.ipfsCID})`);

    // [SIMULATED IN-MEMORY] Unauthorized Tamper Attempt by Attacker Eve
    console.log("\n    [*] [SIMULATED IN-MEMORY] Attacker Eve attempts unauthorized record overwrite...");
    const tamperResult = blockchain.tamperProtectedUpdate({
      caller: blockchain.accounts.attacker,
      recordId: testRecordId,
      newCID: "QmMaliciousInjectedCorruptedPayload0000000000",
      newDataHash: "0xdeadbeef1337badc0de",
      proxyGatewayIP: "194.26.29.112:8080 (Tor Exit Node)",
      attackVector: "UNAUTHORIZED_RECORD_OVERWRITE_INJECTION",
      signatureValid: false
    });

    // Assertions for Tamper Neutralization
    assert.strictEqual(tamperResult.tamperNeutralized, true, "Tamper attempt must be neutralized");
    assert.strictEqual(tamperResult.event.eventName, "UnauthorizedTamperAttempt", "Security alert event must be emitted");
    assert.strictEqual(tamperResult.event.caller, blockchain.accounts.attacker);
    assert.ok(tamperResult.event.gasUsed <= 42500, "Gas consumed must be within <= 42,500 gas ceiling");

    // Verify on-chain state was NOT modified
    const recordAfterTamper = blockchain.getRecord(testRecordId, blockchain.accounts.doctor);
    assert.strictEqual(recordAfterTamper.ipfsCID, ipfsChunk.cid, "Record CID must remain uncorrupted");

    console.log(`    Tamper Neutralized:          ${tamperResult.tamperNeutralized}`);
    console.log(`    Smart Contract Audit Status: ${tamperResult.reason}`);
    console.log(`    Event Emitted:               ${tamperResult.event.eventName}`);
    console.log(`    Captured Attacker Wallet:    ${tamperResult.event.caller}`);
    console.log(`    Captured Attacker Proxy IP:  ${tamperResult.event.proxyGatewayIP}`);
    console.log(`    Gas Consumed by Alert:       ${tamperResult.event.gasUsed} gas`);
    console.log(`    Dissertation Bound:          <= 42,500 gas (Margin: ${42500 - tamperResult.event.gasUsed} gas)`);
    console.log(`    State Preservation:          VERIFIED UNMODIFIED`);
    console.log("    [PASSED] Objective 4 strictly satisfied and asserted.\n");

    // -------------------------------------------------------------
    // OBJECTIVE 5: FORENSIC PROXY ALERT DAEMON & DUAL ALERT
    // -------------------------------------------------------------
    console.log("[*] Objective 5: Testing Forensic Proxy Alert Daemon & Ingress Attribution...");
    const daemon = new ForensicAlertDaemon(blockchain, null);
    const forensicReport = await daemon.analyzeTamperEvent(tamperResult.event);
    const dualAlert = await daemon.dispatchDualAlert(forensicReport);

    assert.ok(forensicReport.incidentId, "Incident ID must be generated");
    assert.strictEqual(forensicReport.attackerWallet, blockchain.accounts.attacker);
    assert.ok(dualAlert.patientAlert, "Patient alert must be dispatched");
    assert.ok(dualAlert.doctorAlert, "Doctor alert must be dispatched");

    console.log(`    Incident ID:              ${forensicReport.incidentId}`);
    console.log(`    Attacker Wallet:          ${forensicReport.attackerWallet}`);
    console.log(`    Attacker Proxy IP:        ${forensicReport.ingressSource.rawProxyIP}`);
    console.log(`    GeoIP Geolocation:        ${forensicReport.geolocation.city}, ${forensicReport.geolocation.country}`);
    console.log(`    Proxy Classification:     ${forensicReport.geolocation.proxyType} (ASN: ${forensicReport.geolocation.asn})`);
    console.log(`    Threat Intelligence Score:${forensicReport.threatScore} / 100`);
    console.log(`    Dual Alert Channel 1:     ${dualAlert.patientAlert.channel} -> DISPATCHED to Patient`);
    console.log(`    Dual Alert Channel 2:     ${dualAlert.doctorAlert.channel} -> DISPATCHED to Doctor`);
    console.log(`    Dual Alert Dispatch Time: ${dualAlert.dispatchLatencyMs} ms`);
    console.log("    [PASSED] Objective 5 strictly satisfied and asserted.\n");

    // -------------------------------------------------------------
    // OBJECTIVE 3: 1-CLICK PATIENT EMERGENCY SOS SIGNALING
    // -------------------------------------------------------------
    console.log("[*] Objective 3: Testing 1-Click Patient Emergency SOS Tele-Triage Signaling...");
    const teleTriage = new TeleTriageHub(null);
    
    // Genuine local execution time measurement (not simulated jitter)
    const tStart = performance.now();
    const sosAlert = teleTriage.triggerEmergencySOS({
      patient: blockchain.accounts.patient,
      doctor: blockchain.accounts.doctor,
      clientTimestamp: Date.now(),
      acuteRisk: "ACUTE_STEMI_CARDIAC_ARREST_RISK",
      vitals: {
        heartRate: 142,
        bloodPressure: "185/110",
        spo2: 88,
        cardiacRhythm: "ST-Elevation (STEMI)",
        respiratoryRate: 28
      }
    });
    const genuineLocalDispatchMs = performance.now() - tStart;

    assert.ok(sosAlert.callId, "Emergency call ID must be generated");
    assert.ok(genuineLocalDispatchMs < 100, "Local CPU dispatch must be fast (< 100 ms)");

    console.log(`    Emergency Call ID:        ${sosAlert.callId}`);
    console.log(`    Acute Risk Condition:     ${sosAlert.acuteRisk}`);
    console.log(`    Genuine Local Dispatch:   ${genuineLocalDispatchMs.toFixed(3)} ms (Empirically Measured)`);
    console.log(`    [SIMULATED SCENARIO]      Modeled WAN Transit Delay: ~18-45 ms (Theoretical cellular transit model)`);

    // Doctor Accepts Call & WebRTC signaling
    const acceptedCall = teleTriage.acceptCall(sosAlert.callId, blockchain.accounts.doctor);
    assert.strictEqual(acceptedCall.status, 'CALL_ACCEPTED_AWAITING_MEDIA', "Call status must be accepted awaiting media");
    console.log(`    Doctor Tele-Triage Accept:${acceptedCall.status}`);

    // Precaution Guidance (Neutral clinical text, no autonomous prescriptions)
    const precautionMsg = teleTriage.sendPrecautionMessage(sosAlert.callId, {
      sender: blockchain.accounts.doctor,
      senderRole: "doctor",
      message: "Emergency notification received. Awaiting assessment by an authorized clinician."
    });
    assert.ok(precautionMsg.message.includes("Awaiting assessment"), "Guidance must be neutral clinical notice");
    console.log(`    Clinical Guidance:        "${precautionMsg.message}"`);
    console.log("    [PASSED] Objective 3 strictly satisfied and asserted.\n");

    // -------------------------------------------------------------
    // OBJECTIVE 6: VALIDATING BENCHMARK ARTIFACTS
    // -------------------------------------------------------------
    console.log("[*] Objective 6: Validating Synthetic ICU-Like Clinical Scenario Benchmark Results...");
    const benchPath = path.join(__dirname, '../benchmark/mimic3_results.json');
    assert.ok(fs.existsSync(benchPath), "benchmark/mimic3_results.json must exist");

    const benchData = JSON.parse(fs.readFileSync(benchPath, 'utf8'));
    assert.strictEqual(benchData.sample_records, 10000, "Benchmark must cover 10,000 synthetic records");
    assert.strictEqual(benchData.crypto_sample_count, 1000, "Crypto sample count must equal 1,000 recorded iterations");
    assert.ok(benchData.economic_cost_analysis, "Economic cost analysis must be present");
    assert.strictEqual(benchData.economic_cost_analysis.scenario_a_gas_savings_pct, 99.4, "Scenario A gas savings must equal 99.40%");
    assert.strictEqual(benchData.tamper_alert_gas.consumed, 30652, "EVM receipt gas must equal 30,652");

    console.log(`    Total Records:            ${benchData.sample_records}`);
    console.log(`    Crypto Sample Count:      ${benchData.crypto_sample_count} iterations`);
    console.log(`    Mean SOS CPU Latency:     ${benchData.tele_triage_sos_latencies_ms.mean} ms`);
    console.log(`    Tamper Alert Receipt Gas: ${benchData.tamper_alert_gas.consumed} gas (Limit <= 42,500 gas)`);
    console.log(`    Scenario A Gas Savings:   ${benchData.economic_cost_analysis.scenario_a_gas_savings_pct}%`);
    console.log(`    Scenario A Polygon Cost:  $${benchData.economic_cost_analysis.scenario_a_polygon_l2_cost_usd} USD`);
    console.log(`    Scenario B Polygon Cost:  $${benchData.economic_cost_analysis.scenario_b_polygon_l2_cost_usd} USD`);
    console.log("    [PASSED] Benchmark artifacts verified against documented values.\n");

    console.log("=".repeat(80));
    console.log(" [SUCCESS] DIRECT ARCHITECTURAL VERIFICATION COMPLETED CLEANLY");
    console.log(" All genuine assertions passed. Simulated components explicitly labeled.");
    console.log(" Note: Academic research prototype for testing; not certified for clinical use.");
    console.log("=".repeat(80) + "\n");

  } catch (err) {
    console.error("\n[!] VERIFICATION ASSERTION FAILED:");
    console.error(err);
    process.exit(1);
  }
}

runDirectVerification();
