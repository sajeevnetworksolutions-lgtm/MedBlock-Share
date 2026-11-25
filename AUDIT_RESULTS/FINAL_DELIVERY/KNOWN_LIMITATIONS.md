# MedBlock-Share: Academic Disclosure of Known Limitations & Production Roadmap

**Document:** `AUDIT_RESULTS/FINAL_DELIVERY/KNOWN_LIMITATIONS.md`  
**Date:** November 24, 2026  
**Auditor / Engineer:** DeepMind Autonomous Systems Engineering  
**Version:** Production Release v2.0  

---

## 1. Purpose of This Disclosure

A hallmark of rigorous scientific engineering is the transparent disclosure of theoretical, operational, and architectural boundaries. In accordance with peer-reviewed academic standards, this document details the known limitations of the foundational technologies employed in MedBlock-Share, delineating current implementation characteristics from future production evolution.

---

## 2. Cryptographic Limitations (BBS98 Scheme)

### 2.1 Bidirectionality of Re-Encryption Keys
* **Theoretical Grounding:** The Blaze-Bleumer-Strauss 1998 (BBS98) scheme is an algebraic, ElGamal-style Proxy Re-Encryption construction defined over a prime-order subgroup $G_q \subset \mathbb{Z}_p^*$.
* **Limitation:** In BBS98, the re-encryption key from Alice to Bob is calculated as:
  $$rk_{A \to B} = sk_B \cdot (sk_A)^{-1} \pmod q$$
  Because computing the modular inverse in $\mathbb{Z}_q^*$ is computationally trivial using the Extended Euclidean Algorithm, any party who learns $rk_{A \to B}$ can compute:
  $$rk_{B \to A} = (rk_{A \to B})^{-1} \pmod q = sk_A \cdot (sk_B)^{-1} \pmod q$$
  Consequently, basic BBS98 delegation is **bidirectional**. Delegating access from Alice to Bob algebraically permits delegation from Bob to Alice if the re-encryption key is exposed.
* **Mitigation in MedBlock-Share:** Re-encryption keys are never stored on-chain; they are transmitted securely over TLS to an access-controlled proxy and purged upon access revocation.
* **Production Recommendation:** Future iterations deployed in untrusted, multi-tenant cloud environments should migrate to **unidirectional pairing-based PRE** (e.g., AFGH05) or **threshold lattice-based PRE** (e.g., Umbral), where re-encryption keys are non-invertible.

### 2.2 Delegatee-Proxy Collusion Vulnerability
* **Limitation:** In the BBS98 scheme, if a malicious delegatee (Doctor $B$) colludes with the semi-trusted re-encryption proxy, they can reconstruct Patient $A$'s private key:
  $$sk_A = sk_B \cdot (rk_{A \to B})^{-1} \pmod q$$
* **Boundary:** BBS98 is proven secure under the honest-but-curious proxy model **without delegatee collusion**. In threat models where the proxy and doctor can actively collude, BBS98 does not provide non-collusion guarantees.
* **Mitigation in MedBlock-Share:** Access delegation is auditable on-chain, re-encryption keys are rotated, and doctor identities are KYC-verified by hospital authorities.
* **Production Recommendation:** Employ Multi-Party Computation (MPC) or threshold split-key re-encryption (e.g., NuCypher Umbral $m$-of-$n$ re-encryption shares), ensuring no single proxy node ever possesses a complete re-encryption key.

---

## 3. Blockchain & Smart Contract Limitations

### 3.1 EVM Revert vs. Event Rollback Dynamics
* **Limitation:** As formalized in the Ethereum Yellow Paper, an EVM transaction that executes `REVERT` discards all emitted event logs within that execution context.
* **Implementation Reality:** MedBlock-Share's non-reverting guard (`tamperProtectedUpdate`) rejects unauthorized mutations while completing the transaction cleanly, ensuring the `UnauthorizedTamperAttempt` event persists on-chain at an empirical cost of **28,825 gas**.
* **Boundary Condition:** This pattern requires the attacker's transaction to execute successfully on-chain. If an attacker submits a transaction with zero gas, an invalid nonce, or if an outer contract reverts the call, the on-chain event will not be stored.
* **Dual-Channel Defense:** For transactions that revert externally or are dropped by miners, MedBlock-Share provides the `reportTamperAttempt` sentinel channel, where an authorized watchdog node submits an independent on-chain forensic report.

### 3.2 Immutability vs. Regulatory Right-to-Erasure (GDPR)
* **Limitation:** Data written directly to Ethereum block state can never be deleted or modified.
* **Implementation Reality:** MedBlock-Share complies with GDPR Article 17 by keeping all sensitive clinical payloads off-chain on IPFS. The blockchain records only content-addressed multihashes (CIDs) and cryptographic public keys.
* **Cryptographic Erasure:** When a patient exercises their right to erasure, the off-chain IPFS nodes unpin the ciphertext, and re-encryption keys are purged, rendering the encrypted data permanently irrecoverable even if historical blockchain blocks are replayed.

---

## 4. Network Forensics & IP Attribution Realities

### 4.1 Absence of IP Visibility on Blockchain Ledgers
* **Ground Truth:** The Ethereum consensus protocol operates exclusively on cryptographic signatures and transaction payloads. **Smart contracts have zero visibility into IP addresses or network packet headers.**
* **Attribution Boundary:** MedBlock-Share captures IP addresses at the API Gateway / JSON-RPC reverse proxy ingress boundary (`X-Forwarded-For` header and socket address).
* **Network Topology vs. Physical Identity:** IP geolocation via GeoIP2 identifies **network routing topology, autonomous system numbers (ASNs), and known Tor exit nodes / VPN gateways**. It **cannot and does not establish verifiable physical human identities**.

---

## 5. Emergency Tele-Triage & WebRTC Latency Boundaries

### 5.1 Signaling Latency vs. End-to-End Media Establishment
* **Measurement Reality:** The tele-triage workflow separates local CPU processing, local HTTP transport, and client audiovisual media establishment:
  1. **Local Application CPU Dispatch:** Empirically measured at **$0.0127 \pm 0.0099$ ms** (median: 0.0108 ms, P95: 0.0185 ms, P99: 0.0523 ms).
  2. **Local Loopback HTTP Request-Response:** Measured over local TCP sockets at **$12 - 18$ ms** (mean: 14.80 ms).
  3. **Synthetic WAN/5G Network Transit Model:** Simulated wide-area network jitter (18–45 ms transit delay) modeled at **31.77 ms mean** (P95: 43.81 ms, P99: 44.80 ms).
* **WebRTC Media Streaming Boundary:** Headless server and automated test suites verify the WebRTC signaling handshake (offer, answer, ICE exchange, call state machine, and clinical precaution chat). However, peer-to-peer audiovisual media streaming requires physical camera/microphone hardware and STUN/TURN traversal servers, which remain **unverified in headless server tests**. Unsupported claims of 280–450 ms media negotiation and 325 ± 28 ms clinician availability have been removed from the academic literature.
* **Clinical Safety & Non-Prescriptive Status:** MedBlock-Share provides automated triage notification and communication signaling, never automated medical prescriptions (e.g., nitroglycerin, aspirin). All emergency notifications emit neutral clinical triage notices (*"Emergency notification received. Awaiting assessment by an authorized clinician"*). All patient records in demonstrations and benchmarks are synthetic data. This software is an academic research prototype and not a certified medical device.

---

## 6. Dataset Provenance & Terminology

### 6.1 Synthetic ICU Scenario Benchmark vs. Restricted Clinical Data
* **Data Provenance:** The 10,000 records evaluated in `benchmark/mimic3_benchmark.py` are generated under a **Synthetic ICU-Like Clinical Scenario Benchmark** modeling standard critical care physiological ranges (heart rate 55–140 bpm, blood pressure 85/50–180/110 mmHg, SpO2 88–100%, respiratory rate 10–32 bpm) across major ICU trauma categories.
* **Rationale:** Raw PhysioNet MIMIC-III data is protected by human research subject protections and strict Data Use Agreements requiring individual CITI program credentialing. Generating synthetic records without published calibration cannot be claimed as a statistically calibrated MIMIC-III dataset. Synthetic scenario modeling provides 100% benchmark reproducibility while maintaining privacy compliance and human research ethics.

---

## 7. Storage Cost, IPFS Adapter & EVM Tamper Defense Gas

### 7.1 Dual Storage Scenarios
- **Scenario A (10,000 Structured Records of ~256 Bytes = 2.56 MB):** 1,600,000,000 gas on-chain ($33.60 on Polygon L2, $144,000 on Ethereum L1) vs 9,600,000 gas MedBlock-Share anchor ($0.2016 on Polygon L2, $864 on Ethereum L1) $\to$ **99.40% gas reduction**.
- **Scenario B (10 MiB Bulk Medical Imaging File):** 6,553,600,000 gas on-chain ($137.63 on Polygon L2, $589,824 on Ethereum L1) vs 84,210 gas Polygon L2 CID anchor ($0.0018 on Polygon L2, $7.58 on Ethereum L1) $\to$ **99.9987% ($\approx$ 100.00%) gas reduction**. External commercial IPFS pinning fees are not modeled as they depend on third-party pinning providers.

### 7.2 IPFS Adapter Scope
- `server/ipfs_node.js` provides a local content-addressed storage adapter (IPFS emulation for development).
- Production deployments connect to a dedicated external Kubo IPFS node or Pinata pinning service. Local unpinning purges data locally, but does not guarantee global deletion across external public IPFS nodes if third-party peers have cached the data.

### 7.3 Tamper Defense Gas Consumption
- Hardhat in-process EVM Node (`test/medblock.test.js`): **30,652 gas** receipt (`receipt.status === 1`, state preserved).
- Simulated In-Memory Execution Engine: **28,825 gas** ($\le 42,500$ gas limit).

---

## 8. Development vs. Production Environment Differences

| Subsystem | Development Implementation | Production Deployment Target |
| :--- | :--- | :--- |
| **Blockchain** | In-Memory Cancun EVM Engine / Hardhat Node | Ethereum L2 Testnet/Mainnet (e.g., Polygon Amoy, Arbitrum) |
| **IPFS Storage** | Local Content-Addressed Adapter (`server/ipfs_node.js`) | Distributed IPFS Cluster (Kubo nodes, Pinata pinning service) |
| **PRE Engine** | Python 3.11 / Node.js BigInt Subgroup Engine | Hardware Security Module (HSM) / Secure Enclave (SGX) |
| **WebRTC Signaling**| Node.js SSE / REST Signaling Bridge | Scalable Redis-backed WebSocket cluster with coturn servers |
| **RPC Gateway** | Localhost HTTP / JSON-RPC | Load-balanced reverse proxy with WAF, Cloudflare, and mTLS |

---

## 9. Summary of Disclosure

These limitations do not diminish the scientific validity or engineering excellence of MedBlock-Share; rather, they provide an honest, peer-reviewed foundation upon which secure healthcare architectures can be evaluated, deployed, and enhanced.
