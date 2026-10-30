const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MedBlock-Share Smart Contract Suite (M.Tech Dissertation Specification)", function () {
  let medBlock;
  let owner, patient, doctor, unauthorizedUser, attacker;

  const RECORD_ID = "EHR-2026-9041";
  const IPFS_CID = "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco";
  const DATA_HASH = ethers.keccak256(ethers.toUtf8Bytes("EncryptedMedicalPayload-JaneDoe-MIMIC-III"));
  const RECORD_TYPE = "DICOM_CARDIAC_CT";
  const C1 = "0x1abb89e8affb5ddca89182637647a03a7c96fd2b1ceb017b";
  const C2 = "0x943178e931087b41f2305fbe197e6f65bd73f4bc30354f87";
  const BBS98_RK = "0x4b14314305e8a0cb3dbeab264b14314305e8a0cb3dbeab26";

  beforeEach(async function () {
    [owner, patient, doctor, unauthorizedUser, attacker] = await ethers.getSigners();
    const MedBlockFactory = await ethers.getContractFactory("MedBlockRegistry");
    medBlock = await MedBlockFactory.deploy();
    await medBlock.waitForDeployment();
  });

  describe("Phase 1: Dual-Tier Storage & Record Registration (Objective 1)", function () {
    it("should allow a patient to register an encrypted medical record with IPFS CID", async function () {
      const tx = await medBlock.connect(patient).registerRecord(
        RECORD_ID,
        IPFS_CID,
        DATA_HASH,
        RECORD_TYPE,
        C1,
        C2
      );

      await expect(tx)
        .to.emit(medBlock, "RecordRegistered")
        .withArgs(RECORD_ID, patient.address, IPFS_CID, DATA_HASH, RECORD_TYPE, (val) => val > 0n);

      const record = await medBlock.connect(patient).getRecord(RECORD_ID);
      expect(record.patient).to.equal(patient.address);
      expect(record.ipfsCID).to.equal(IPFS_CID);
      expect(record.dataHash).to.equal(DATA_HASH);
      expect(record.recordType).to.equal(RECORD_TYPE);
      expect(record.c1).to.equal(C1);
      expect(record.c2).to.equal(C2);
      expect(record.isFrozen).to.equal(false);
    });

    it("should prevent duplicate record registration", async function () {
      await medBlock.connect(patient).registerRecord(
        RECORD_ID,
        IPFS_CID,
        DATA_HASH,
        RECORD_TYPE,
        C1,
        C2
      );

      await expect(
        medBlock.connect(patient).registerRecord(RECORD_ID, IPFS_CID, DATA_HASH, RECORD_TYPE, C1, C2)
      ).to.be.revertedWith("Record already exists");
    });
  });

  describe("Phase 2: PRE Consent Management & Access Control (Objective 2)", function () {
    beforeEach(async function () {
      await medBlock.connect(patient).registerRecord(
        RECORD_ID,
        IPFS_CID,
        DATA_HASH,
        RECORD_TYPE,
        C1,
        C2
      );
    });

    it("should allow patient to grant doctor consent with BBS98 re-key rk_{A -> B}", async function () {
      const oneWeekInSeconds = 7 * 24 * 60 * 60;
      const latestBlock = await ethers.provider.getBlock("latest");
      const expiry = latestBlock.timestamp + oneWeekInSeconds;

      const tx = await medBlock.connect(patient).grantDoctorConsent(
        doctor.address,
        expiry,
        BBS98_RK
      );

      await expect(tx)
        .to.emit(medBlock, "ConsentGranted")
        .withArgs(patient.address, doctor.address, expiry, (val) => val > 0n);

      const [isAuthorized, rk, exp] = await medBlock.getDoctorConsent(patient.address, doctor.address);
      expect(isAuthorized).to.be.true;
      expect(rk).to.equal(BBS98_RK);
      expect(exp).to.equal(expiry);

      // Consented doctor can now retrieve record metadata
      const record = await medBlock.connect(doctor).getRecord(RECORD_ID);
      expect(record.ipfsCID).to.equal(IPFS_CID);
    });

    it("should deny access to unauthorized doctor without consent", async function () {
      await expect(
        medBlock.connect(unauthorizedUser).getRecord(RECORD_ID)
      ).to.be.revertedWithCustomError(medBlock, "ConsentExpiredOrMissing");
    });

    it("should allow patient to revoke doctor consent", async function () {
      const latestBlock = await ethers.provider.getBlock("latest");
      const expiry = latestBlock.timestamp + 3600;

      await medBlock.connect(patient).grantDoctorConsent(doctor.address, expiry, BBS98_RK);
      await medBlock.connect(patient).revokeDoctorConsent(doctor.address);

      const [isAuthorized] = await medBlock.getDoctorConsent(patient.address, doctor.address);
      expect(isAuthorized).to.be.false;

      await expect(
        medBlock.connect(doctor).getRecord(RECORD_ID)
      ).to.be.revertedWithCustomError(medBlock, "ConsentExpiredOrMissing");
    });
  });

  describe("Phase 3: 1-Click Patient Emergency Risk SOS (Objective 3 & Section 6.3)", function () {
    it("should dispatch priority emergency SOS alert to designated doctor", async function () {
      const TELEMETRY_CID = "QmEmergencyTelemetryMIMIC3-Vitals-Ward4";
      const VITALS_HASH = ethers.keccak256(ethers.toUtf8Bytes("HR:142-SPO2:88-BP:185/110"));
      const SEVERITY = "CRITICAL_ACUTE_CORONARY_RISK";

      const tx = await medBlock.connect(patient).dispatchEmergencySOS(
        doctor.address,
        TELEMETRY_CID,
        VITALS_HASH,
        SEVERITY
      );

      await expect(tx)
        .to.emit(medBlock, "EmergencySOSTriggered")
        .withArgs(patient.address, doctor.address, TELEMETRY_CID, SEVERITY, (val) => val > 0n);
    });
  });

  describe("Phase 4: Cryptographic Tamper-Detection & Forensic Proxy Attribution (Objective 4 & Section 6.2, 6.3)", function () {
    const FAKE_CID = "QmMaliciousTamperedEHRPayload000000000000000";
    const ATTACKER_PROXY_IP = "194.26.29.112:8080 (Tor-Exit-Node)";
    const ATTACK_VECTOR = "UNAUTHORIZED_RECORD_OVERWRITE_INJECTION";
    const ATTACK_PAYLOAD = ethers.toUtf8Bytes("TAMPER_INJECTION_EXPLOIT_PAYLOAD");

    beforeEach(async function () {
      await medBlock.connect(patient).registerRecord(
        RECORD_ID,
        IPFS_CID,
        DATA_HASH,
        RECORD_TYPE,
        C1,
        C2
      );
    });

    it("should detect unauthorized tamper attempt, emit event with proxy IP & revert or log forensic metadata", async function () {
      // Attacker signs with their own key (invalid patient signature)
      const fakeSignature = await attacker.signMessage(
        ethers.getBytes(ethers.keccak256(ethers.toUtf8Bytes("fake")))
      );

      const tx = await medBlock.connect(attacker).attemptTamperRecord(
        RECORD_ID,
        FAKE_CID,
        ATTACKER_PROXY_IP,
        ATTACK_VECTOR,
        ATTACK_PAYLOAD,
        fakeSignature
      );

      await expect(tx)
        .to.emit(medBlock, "UnauthorizedTamperAttempt")
        .withArgs(
          attacker.address,
          patient.address,
          RECORD_ID,
          (val) => val > 0n,
          ATTACKER_PROXY_IP,
          ATTACK_PAYLOAD,
          ATTACK_VECTOR
        );

      // Verify the record's IPFS CID remained untouched (tamper prevented)
      const record = await medBlock.connect(patient).getRecord(RECORD_ID);
      expect(record.ipfsCID).to.equal(IPFS_CID);
    });

    it("should satisfy the dissertation gas bound: Gas(EmitTamperAlert) <= 42,500 gas", async function () {
      const tx = await medBlock.connect(attacker).emitTamperAlert(
        patient.address,
        RECORD_ID,
        "194.26.29.112",
        "INTRUSION_ALERT",
        ethers.toUtf8Bytes("GAS_BOUND_BENCHMARK")
      );

      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed;

      console.log(`\n    ================ GAS BENCHMARK ================`);
      console.log(`    Gas Consumed for Tamper Alert: ${gasUsed} gas`);
      console.log(`    Dissertation Bound:           <= 42,500 gas`);
      console.log(`    Gas Margin:                   ${42500n - gasUsed} gas below limit`);
      console.log(`    Status:                       COMPLIANT with Section 6.3 Proof`);
      console.log(`    ===============================================\n`);

      expect(gasUsed).to.be.lessThanOrEqual(42500n);
    });

    it("should allow patient to quarantine/freeze compromised record upon forensic alert", async function () {
      await medBlock.connect(patient).quarantineRecord(RECORD_ID, "Compromise detected by Forensic Alert Daemon");

      await expect(
        medBlock.connect(patient).getRecord(RECORD_ID)
      ).to.be.revertedWithCustomError(medBlock, "RecordIsQuarantined");
    });
  });
});
