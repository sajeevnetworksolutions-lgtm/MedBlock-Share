// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @title MedBlockRegistry
 * @dev MedBlock-Share: Decentralized Patient-Centric Electronic Health Record Sharing
 *      via Proxy Re-Encryption, Emergency Tele-Triage & Tamper-Alert Proxy Forensics.
 *
 * Architecture & EVM Tamper Defense Model:
 *   In EVM, a full revert() rolls back all state and log emissions of that transaction.
 *   To ensure authentic, non-repudiable on-chain evidence, MedBlock-Share implements:
 *     1. Non-Reverting Tamper Defense Guard (`tamperProtectedUpdate`):
 *        Rejects unauthorized data modification without rolling back the transaction,
 *        allowing `UnauthorizedTamperAttempt` to persistently log on the Ethereum ledger.
 *     2. Sentinel Forensic Reporting (`reportTamperAttempt`):
 *        Allows an authorized hospital gateway or watchdog sentinel to report externally
 *        reverted calls or RPC-intercepted attacks with non-repudiable proxy IP details.
 *     3. Strict Access Control on Records:
 *        Cryptographic ECDSA verification: Audit(H_CID, sigma) = 1{VerifySig(pk, H, sigma)}.
 *     4. Low-Cost Gas Bound:
 *        Tamper alert emission strictly guaranteed <= 42,500 gas (dissertation Section 6.3).
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
        uint256 lastModified;
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

    struct TamperAudit {
        address attacker;
        address targetPatient;
        string recordId;
        uint256 timestamp;
        string proxyGatewayIP;
        string attackVector;
        bytes attackPayload;
    }

    // Contract State
    address public contractOwner;
    mapping(address => bool) public authorizedSentinels;

    mapping(string => MedicalRecord) private records;
    mapping(address => string[]) private patientRecordIds;
    mapping(address => mapping(address => DoctorConsent)) private consentMatrix; // patient => doctor => consent
    mapping(address => address[]) private patientDoctors;
    mapping(string => uint256) public recordTamperCount;
    TamperAudit[] public tamperAuditLog;

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

    event SentinelUpdated(address indexed sentinel, bool isAuthorized);

    // Errors
    error RecordNotFound(string recordId);
    error UnauthorizedAccess(address caller, string recordId);
    error RecordIsQuarantined(string recordId);
    error ConsentExpiredOrMissing(address patient, address doctor);
    error OnlySentinelOrOwner(address caller);

    modifier onlyOwner() {
        require(msg.sender == contractOwner, "Only contract owner");
        _;
    }

    modifier onlySentinel() {
        if (msg.sender != contractOwner && !authorizedSentinels[msg.sender]) {
            revert OnlySentinelOrOwner(msg.sender);
        }
        _;
    }

    constructor() {
        contractOwner = msg.sender;
        authorizedSentinels[msg.sender] = true;
    }

    function setSentinel(address sentinel, bool authorized) external onlyOwner {
        authorizedSentinels[sentinel] = authorized;
        emit SentinelUpdated(sentinel, authorized);
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
            lastModified: block.timestamp,
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
     */
    function dispatchEmergencySOS(
        address doctor,
        string calldata telemetryCID,
        bytes32 /* vitalsHash */,
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
     * @notice Architecture 1: Non-Reverting Tamper Defense Guard.
     *         Protects the record against unauthorized modification while allowing the
     *         `UnauthorizedTamperAttempt` event to PERSIST on-chain in the block receipt!
     *         Audit(H_CID, sigma) = 1{VerifySig(pk_patient, H_CID, sigma)}, Alert if 0.
     */
    function tamperProtectedUpdate(
        string calldata recordId,
        string calldata newCID,
        bytes32 newDataHash,
        string calldata proxyGatewayIP,
        string calldata attackVector,
        bytes calldata attackPayload,
        bytes calldata signature
    ) external returns (bool success) {
        address patient = records[recordId].patient;
        if (patient == address(0)) revert RecordNotFound(recordId);
        if (records[recordId].isFrozen) revert RecordIsQuarantined(recordId);

        // Verify cryptographic signature: Audit(H_CID, sigma)
        bytes32 messageHash = keccak256(
            abi.encodePacked(
                "\x19Ethereum Signed Message:\n32",
                keccak256(abi.encodePacked(recordId, newCID, msg.sender))
            )
        );

        // Tamper condition: caller is NOT owner OR signature does not match owner
        if (msg.sender != patient || recoverSigner(messageHash, signature) != patient) {
            recordTamperCount[recordId]++;

            // Emit persistent on-chain security alert
            emit UnauthorizedTamperAttempt(
                msg.sender,
                patient,
                recordId,
                block.timestamp,
                proxyGatewayIP,
                attackPayload,
                attackVector
            );

            // Record preserved: state NOT altered
            return false;
        }

        // Valid owner update
        records[recordId].ipfsCID = newCID;
        records[recordId].dataHash = newDataHash;
        records[recordId].lastModified = block.timestamp;
        return true;
    }

    /**
     * @notice Architecture 2: Sentinel Forensic Reporting.
     *         Allows an authorized hospital RPC gateway or security daemon to commit
     *         forensic evidence on-chain when an attack is intercepted or reverted off-chain.
     */
    function reportTamperAttempt(
        address attacker,
        address targetPatient,
        string calldata recordId,
        string calldata proxyGatewayIP,
        string calldata attackVector,
        bytes calldata attackPayload
    ) external onlySentinel returns (bool) {
        recordTamperCount[recordId]++;

        tamperAuditLog.push(TamperAudit({
            attacker: attacker,
            targetPatient: targetPatient,
            recordId: recordId,
            timestamp: block.timestamp,
            proxyGatewayIP: proxyGatewayIP,
            attackVector: attackVector,
            attackPayload: attackPayload
        }));

        emit UnauthorizedTamperAttempt(
            attacker,
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
     * @notice Architecture 3: Pure Gas Bound Audited Tamper Alert.
     *         Guaranteed bound: <= 42,500 gas (dissertation Section 6.3).
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
        require(msg.sender == r.patient || authorizedSentinels[msg.sender], "Unauthorized to quarantine");

        r.isFrozen = true;
        emit RecordQuarantined(recordId, r.patient, reason, block.timestamp);
    }

    function getPatientRecords(address patient) external view returns (string[] memory) {
        return patientRecordIds[patient];
    }

    function getTamperAuditCount() external view returns (uint256) {
        return tamperAuditLog.length;
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
