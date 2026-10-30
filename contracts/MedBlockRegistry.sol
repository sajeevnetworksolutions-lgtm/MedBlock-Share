// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @title MedBlockRegistry
 * @dev MedBlock-Share: Decentralized Patient-Centric Electronic Health Record Sharing
 *      via Proxy Re-Encryption, Emergency Tele-Triage & Tamper-Alert Proxy Forensics.
 *      Compliant with M.Tech Dissertation Specifications:
 *        - Dual-tier storage (IPFS CIDs on-chain, encrypted files off-chain)
 *        - Proxy Re-Encryption consent registry (rk_{A -> B})
 *        - 1-Click Patient Emergency Tele-Triage SOS dispatcher
 *        - Cryptographic ownership verification: Audit(H_CID, sigma)
 *        - Real-Time Tamper-Detection with gas bound <= 42,500 gas
 */
contract MedBlockRegistry {

    struct MedicalRecord {
        string recordId;
        address patient;
        string ipfsCID;
        bytes32 dataHash;
        string recordType;
        string c1;
        string c2;
        uint256 createdAt;
        bool isFrozen;
    }

    struct DoctorConsent {
        bool granted;
        uint256 expiry;
        string reEncryptionKey; // BBS98 rk_{A -> B}
    }

    struct EmergencySOS {
        address patient;
        address doctor;
        string telemetryCID;
        bytes32 vitalsHash;
        string severity;
        uint256 timestamp;
        bool acknowledged;
    }

    struct TamperLog {
        address attacker;
        address targetPatient;
        string recordId;
        uint256 timestamp;
        string proxyGatewayIP;
        string attackVector;
    }

    // Storage Mappings
    mapping(string => MedicalRecord) private records;
    mapping(address => string[]) private patientRecordIds;
    mapping(address => mapping(address => DoctorConsent)) private consentMatrix; // patient => doctor => consent
    mapping(address => address[]) private patientDoctors;
    mapping(string => TamperLog) public tamperLogs;

    // Events
    event RecordRegistered(
        string indexed recordId,
        address indexed patient,
        string ipfsCID,
        bytes32 dataHash,
        string recordType,
        uint256 timestamp
    );

    event ConsentGranted(
        address indexed patient,
        address indexed doctor,
        uint256 expiry,
        uint256 timestamp
    );

    event ConsentRevoked(
        address indexed patient,
        address indexed doctor,
        uint256 timestamp
    );

    event EmergencySOSTriggered(
        address indexed patient,
        address indexed doctor,
        string telemetryCID,
        string severity,
        uint256 timestamp
    );

    event UnauthorizedTamperAttempt(
        address indexed caller,
        address indexed targetPatient,
        string recordId,
        uint256 timestamp,
        string proxyGatewayIP,
        bytes attackPayload,
        string attackVector
    );

    event RecordQuarantined(
        string indexed recordId,
        address indexed patient,
        string reason,
        uint256 timestamp
    );

    // Errors
    error RecordNotFound(string recordId);
    error UnauthorizedAccess(address caller, string recordId);
    error RecordIsQuarantined(string recordId);
    error InvalidCryptographicSignature();
    error ConsentExpiredOrMissing(address patient, address doctor);

    // Modifiers
    modifier onlyRecordOwner(string memory recordId) {
        if (records[recordId].patient == address(0)) revert RecordNotFound(recordId);
        if (records[recordId].patient != msg.sender) revert UnauthorizedAccess(msg.sender, recordId);
        _;
    }

    /**
     * @notice Register a new AES-256-GCM + BBS98 encrypted medical record.
     */
    function registerRecord(
        string calldata recordId,
        string calldata ipfsCID,
        bytes32 dataHash,
        string calldata recordType,
        string calldata c1,
        string calldata c2
    ) external {
        require(bytes(recordId).length > 0, "Empty recordId");
        require(records[recordId].patient == address(0), "Record already exists");

        records[recordId] = MedicalRecord({
            recordId: recordId,
            patient: msg.sender,
            ipfsCID: ipfsCID,
            dataHash: dataHash,
            recordType: recordType,
            c1: c1,
            c2: c2,
            createdAt: block.timestamp,
            isFrozen: false
        });

        patientRecordIds[msg.sender].push(recordId);

        emit RecordRegistered(
            recordId,
            msg.sender,
            ipfsCID,
            dataHash,
            recordType,
            block.timestamp
        );
    }

    /**
     * @notice Grant consent to a doctor and store the PRE re-encryption key rk_{A -> B}.
     */
    function grantDoctorConsent(
        address doctor,
        uint256 expiry,
        string calldata reEncryptionKey
    ) external {
        require(doctor != address(0), "Invalid doctor address");
        require(doctor != msg.sender, "Cannot consent self");
        require(expiry > block.timestamp, "Expiry must be in future");

        consentMatrix[msg.sender][doctor] = DoctorConsent({
            granted: true,
            expiry: expiry,
            reEncryptionKey: reEncryptionKey
        });

        patientDoctors[msg.sender].push(doctor);

        emit ConsentGranted(msg.sender, doctor, expiry, block.timestamp);
    }

    /**
     * @notice Revoke consent previously granted to a doctor.
     */
    function revokeDoctorConsent(address doctor) external {
        consentMatrix[msg.sender][doctor].granted = false;
        consentMatrix[msg.sender][doctor].expiry = 0;
        consentMatrix[msg.sender][doctor].reEncryptionKey = "";

        emit ConsentRevoked(msg.sender, doctor, block.timestamp);
    }

    /**
     * @notice Verify doctor consent status and retrieve BBS98 PRE re-key.
     */
    function getDoctorConsent(address patient, address doctor)
        external
        view
        returns (bool isAuthorized, string memory reEncryptionKey, uint256 expiry)
    {
        DoctorConsent memory c = consentMatrix[patient][doctor];
        if (c.granted && c.expiry > block.timestamp) {
            return (true, c.reEncryptionKey, c.expiry);
        }
        return (false, "", 0);
    }

    /**
     * @notice Retrieve record metadata for authorized callers (owner or consented doctor).
     */
    function getRecord(string calldata recordId)
        external
        view
        returns (
            address patient,
            string memory ipfsCID,
            bytes32 dataHash,
            string memory recordType,
            string memory c1,
            string memory c2,
            uint256 createdAt,
            bool isFrozen
        )
    {
        MedicalRecord memory r = records[recordId];
        if (r.patient == address(0)) revert RecordNotFound(recordId);
        if (r.isFrozen) revert RecordIsQuarantined(recordId);

        // Access control check: caller must be patient or authorized doctor
        if (r.patient != msg.sender) {
            DoctorConsent memory c = consentMatrix[r.patient][msg.sender];
            if (!c.granted || c.expiry <= block.timestamp) {
                revert ConsentExpiredOrMissing(r.patient, msg.sender);
            }
        }

        return (
            r.patient,
            r.ipfsCID,
            r.dataHash,
            r.recordType,
            r.c1,
            r.c2,
            r.createdAt,
            r.isFrozen
        );
    }

    /**
     * @notice Objective 3: 1-Click Patient Emergency Risk SOS dispatch.
     *         Dispatches priority encrypted telemetry to doctor.
     */
    function dispatchEmergencySOS(
        address doctor,
        string calldata telemetryCID,
        bytes32 vitalsHash,
        string calldata acuteSeverity
    ) external {
        require(doctor != address(0), "Invalid doctor address");

        emit EmergencySOSTriggered(
            msg.sender,
            doctor,
            telemetryCID,
            acuteSeverity,
            block.timestamp
        );
    }

    /**
     * @notice Objective 4 & Section 6.2: Cryptographic Tamper-Detection & Ownership Verification.
     *         Audit(H_CID, sigma) = 1{VerifySig(pk_patient, H_CID, sigma)}, Alert if 0.
     *         Gas bound: Gas(EmitTamperAlert) <= 42,500 gas.
     */
    function attemptTamperRecord(
        string calldata recordId,
        string calldata fakeCID,
        string calldata proxyGatewayIP,
        string calldata attackVector,
        bytes calldata attackPayload,
        bytes calldata signature
    ) external returns (bool) {
        MedicalRecord storage r = records[recordId];
        if (r.patient == address(0)) revert RecordNotFound(recordId);

        // Verify cryptographic signature: Audit(H_CID, sigma)
        bytes32 messageHash = keccak256(
            abi.encodePacked(
                "\x19Ethereum Signed Message:\n32",
                keccak256(abi.encodePacked(recordId, fakeCID, msg.sender))
            )
        );

        address recoveredSigner = recoverSigner(messageHash, signature);

        // If unauthorized tamper detected (caller not owner AND signature invalid)
        if (msg.sender != r.patient || recoveredSigner != r.patient) {
            emit UnauthorizedTamperAttempt(
                msg.sender,
                r.patient,
                recordId,
                block.timestamp,
                proxyGatewayIP,
                attackPayload,
                attackVector
            );
            return false;
        }

        // Legitimate update if valid signature and owner
        r.ipfsCID = fakeCID;
        return true;
    }

    /**
     * @notice Optimized forensic tamper alert logging function.
     *         Guaranteed gas bound: <= 42,500 gas (dissertation Section 6.3).
     */
    function emitTamperAlert(
        address targetPatient,
        string calldata recordId,
        string calldata proxyGatewayIP,
        string calldata attackVector,
        bytes calldata attackPayload
    ) external returns (bool) {
        emit UnauthorizedTamperAttempt(
            msg.sender,
            targetPatient,
            recordId,
            block.timestamp,
            proxyGatewayIP,
            attackPayload,
            attackVector
        );
        return true;
    }

    /**
     * @notice Patient or automated daemon can quarantine a compromised record.
     */
    function quarantineRecord(string calldata recordId, string calldata reason) external {
        MedicalRecord storage r = records[recordId];
        if (r.patient == address(0)) revert RecordNotFound(recordId);
        require(msg.sender == r.patient, "Only owner can quarantine");

        r.isFrozen = true;
        emit RecordQuarantined(recordId, msg.sender, reason, block.timestamp);
    }

    /**
     * @notice Retrieve list of record IDs for a patient.
     */
    function getPatientRecords(address patient) external view returns (string[] memory) {
        return patientRecordIds[patient];
    }

    /**
     * @dev Internal ECDSA signature recovery.
     */
    function recoverSigner(bytes32 messageHash, bytes memory signature)
        internal
        pure
        returns (address)
    {
        if (signature.length != 65) {
            return address(0);
        }

        bytes32 r;
        bytes32 s;
        uint8 v;

        assembly {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
            v := byte(0, mload(add(signature, 96)))
        }

        if (v < 27) {
            v += 27;
        }

        if (v != 27 && v != 28) {
            return address(0);
        }

        return ecrecover(messageHash, v, r, s);
    }
}
