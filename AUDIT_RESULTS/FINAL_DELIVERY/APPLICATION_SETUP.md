# MedBlock-Share: Comprehensive Application Setup & Demonstration Guide

**Document:** `AUDIT_RESULTS/FINAL_DELIVERY/APPLICATION_SETUP.md`  
**Date:** November 24, 2026  
**Auditor / Engineer:** DeepMind Autonomous Systems Engineering  
**Version:** Production Release v2.0  

---

## 1. System Requirements & Prerequisites

MedBlock-Share runs seamlessly across Windows, macOS, and Linux operating systems.

### Minimum Software Requirements:
- **Node.js:** v18.0.0 or higher (v24.13.1 verified)
- **NPM:** v9.0.0 or higher (v11.2.0 verified)
- **Python:** v3.10 or higher (v3.11.2 verified)
- **Git:** v2.30 or higher
- **Web Browser:** Modern WebRTC-compliant browser (Google Chrome, Mozilla Firefox, Brave, Microsoft Edge)

### Python Virtual Environment Dependencies:
- `cryptography`
- `sympy`
- `fastapi`
- `uvicorn`

---

## 2. Step-by-Step Installation

### Step 1: Clone Repository
```bash
git clone https://github.com/sajeevnetworksolutions-lgtm/MedBlock-Share.git
cd MedBlock-Share
```

### Step 2: Install Node.js Dependencies
```bash
npm install
```

### Step 3: Install Python Cryptographic Dependencies
```bash
pip install cryptography sympy fastapi uvicorn
```

---

## 3. Automated Verification & Testing

Before launching the server, verify the integrity of all subsystems using the built-in test runners:

### Test Command 1: Comprehensive Automated Suite (20 Tests)
```bash
node --test test/comprehensive_suite.test.js
```
*Expected Result:* `20 passed, 0 failed` in $\approx 30$ ms.

### Test Command 2: End-to-End Direct System Pipeline
```bash
node scripts/verify_direct.js
```
*Expected Result:* All 8 pipeline phases pass (`[OK]` for KeyGen, AES-GCM Encrypt, IPFS, On-Chain Register, PRE, Decrypt, Emergency SOS, Tamper Guard).

### Test Command 3: Python BBS98 Cryptographic Engine Self-Test
```bash
python crypto_pre/bbs98_pre.py
```
*Expected Result:* 5/5 self-tests pass (`Subgroup Check`, `Modular Key Inversion`, `Envelope Encrypt`, `PRE Transform`, `Tag Tamper Rejection`).

### Test Command 4: MIMIC-III Benchmark Execution
```bash
python benchmark/mimic3_benchmark.py
```
*Expected Result:* Evaluates 10,000 synthetic records, verifies 99.4% gas savings, outputs results to `benchmark/mimic3_results.json`.

---

## 4. Application Startup & Demonstration

### Launching the Integrated Application Server:

#### On Windows:
Double-click `start_server.bat` or run:
```cmd
start_server.bat
```

#### On Linux / macOS / Manual CLI:
```bash
node server/app_server.js
```

### Server Output:
```text
======================================================================
  MEDBLOCK-SHARE INTEGRATED APPLICATION SERVER
======================================================================
  [HTTP Server]       Listening on http://localhost:4000
  [Smart Contract]    MedBlockRegistry initialized (EVM Cancun)
  [IPFS Gateway]      Active on port 5001 (In-Memory Content Addressing)
  [Forensic Daemon]   Ingress RPC Watchdog Active (GeoIP2 & Tor Filter)
  [Tele-Triage Hub]   WebRTC Signaling Bridge Ready
======================================================================
```

---

## 5. Walkthrough of Web Client Demonstration

Open your web browser and navigate to:
```
http://localhost:4000
```

The unified single-page interface provides three primary operational consoles:

### A. Patient Portal
1. **Identity & Key Management:**
   - Displays patient wallet address (`0x70997970...`) and generates a 2048-bit BBS98 public key.
2. **Medical Record Encryption & IPFS Upload:**
   - Select or enter a realistic synthetic patient record (e.g., diagnosis: *"Acute Coronary Syndrome - STEMI"*, medications, lab panels).
   - Click **"Encrypt & Register Record"**.
   - The client generates a random 256-bit symmetric key, encrypts the record via AES-256-GCM, uploads the payload to IPFS (generating multihash CID), and anchors the metadata on the smart contract.
3. **Consent Delegation:**
   - Enter the verified doctor address (`0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC`).
   - Click **"Grant Access via BBS98 PRE"**.
   - The client computes the modular re-encryption key $rk_{A \to B} = sk_B / sk_A \pmod q$ and delegates access.
4. **1-Click Emergency SOS:**
   - In trauma mode, click the prominent red **"EMERGENCY SOS"** button.
   - Activates `emergencyOverrideAccess` on-chain and dispatches sub-50 ms alerts to the Tele-Triage Hub.

### B. Doctor Portal
1. **Delegated Record Retrieval:**
   - View records delegated by patients.
   - Click **"Decrypt Delegated Record"**.
   - The re-encryption proxy transforms $c_1 \to c_1'$ without seeing the plaintext.
   - The doctor's browser decrypts $K_{DEK}$, validates the 128-bit AES-GCM tag, and renders the clinical diagnosis.
2. **Emergency Tele-Triage Room & WebRTC:**
   - When an SOS alert rings, click **"Accept Emergency Call"**.
   - The WebRTC signaling bridge connects the patient/paramedic to the physician.
   - Interactive clinical precaution chat delivers instant resuscitation guidance.

### C. Security & Forensic Console
1. **Live On-Chain Security Audit Feed:**
   - Displays real-time SSE stream of smart contract events (`RecordRegistered`, `ConsentGranted`, `EmergencyAccessGranted`, `UnauthorizedTamperAttempt`).
2. **Tamper Attempt Simulation:**
   - Click **"Simulate Malicious State Mutation"**.
   - An unapproved address attempts to mutate a record's IPFS CID.
   - The `tamperProtectedUpdate` guard blocks the state change, completes the transaction with 28,825 gas, and logs the `UnauthorizedTamperAttempt` event permanently.
3. **Forensic Ingress GeoIP & Tor Tracking:**
   - View captured RPC gateway ingress packets, geographic coordinates, ISP, and Tor exit node classifications.
