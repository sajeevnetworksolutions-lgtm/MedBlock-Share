"""
MedBlock-Share: BBS98 Proxy Re-Encryption (PRE) Engine
Mathematical Implementation matching Dissertation Synopsis Section 6.1:
  - Blaze-Bleumer-Strauss 1998 (BBS98) Atomic Proxy Re-Encryption
  - Cyclic group G of prime order q in Z_p* (where p = 2q + 1 safe prime)
  - Exponent arithmetic strictly in Z_q (prime field: all non-zero elements invertible)
  - rk_{A -> B} = (sk_B / sk_A) mod q
  - C_A = (g^{r * sk_A} mod p, m * g^r mod p)
  - Proxy Transformation: c1' = (c1)^{rk_{A -> B}} mod p = g^{r * sk_B} mod p
  - Doctor Decryption: g^r = (c1')^{1 / sk_B} mod p => m = c2 / g^r mod p
  - Hybrid AES-256-GCM Envelope Encryption for large Medical Files (DICOM/PDF)
"""

import os
import hashlib
import json
import secrets
from typing import Tuple, Dict, Any
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

# 257-bit Safe Prime p = 2q + 1 and Prime Subgroup Order q
P_HEX = "1b41b6328701822e3bdcc58c1d116bc5f4f2ff624eb4a6ea2b3f7aa1a7d3bb78b"
Q_HEX = "da0db194380c1171dee62c60e88b5e2fa797fb1275a5375159fbd50d3e9ddbc5"
P = int(P_HEX, 16)
Q = int(Q_HEX, 16)
# Generator of prime-order subgroup G: g = 4 = 2^2 mod p
G = 4


class BBS98Engine:
    """
    Blaze-Bleumer-Strauss 1998 atomic proxy re-encryption in prime-order subgroup.
    Matches Section 6.1 of MedBlock-Share Dissertation.
    """

    def __init__(self, p: int = P, g: int = G, q: int = Q):
        self.p = p
        self.g = g
        self.q = q

    def generate_keypair(self) -> Tuple[int, int]:
        """
        Generate private key sk in [2, q-1] and public key pk = g^sk mod p.
        """
        sk = secrets.randbelow(self.q - 3) + 2
        pk = pow(self.g, sk, self.p)
        return sk, pk

    def generate_rekey(self, sk_a: int, sk_b: int) -> int:
        """
        rk_{A -> B} = (sk_b / sk_a) mod q = (sk_b * sk_a^{-1}) mod q
        Since q is prime, every 1 <= sk_a < q has a unique multiplicative inverse.
        """
        inv_sk_a = pow(sk_a, -1, self.q)
        rk_a_to_b = (sk_b * inv_sk_a) % self.q
        return rk_a_to_b

    def encrypt(self, pk_a: int, message_int: int) -> Tuple[int, int]:
        """
        Patient A encrypts integer message m with their public key pk_a.
        c1 = g^{r * sk_A} mod p = (pk_a)^r mod p
        c2 = (m * g^r) mod p
        """
        if message_int <= 0 or message_int >= self.p:
            raise ValueError(f"Message must be in range [1, p-1]")

        r = secrets.randbelow(self.q - 3) + 2
        # c1 = (pk_a)^r mod p = (g^{sk_a})^r mod p = g^{r * sk_a} mod p
        c1 = pow(pk_a, r, self.p)
        # g^r mod p
        g_r = pow(self.g, r, self.p)
        c2 = (message_int * g_r) % self.p
        return c1, c2

    def re_encrypt(self, c1: int, c2: int, rk_a_to_b: int) -> Tuple[int, int]:
        """
        Untrusted Proxy transforms ciphertext C_A = (c1, c2) into C_B = (c1', c2)
        c1' = (c1)^{rk_{A -> B}} mod p
            = (g^{r * sk_a})^{(sk_b / sk_a)} mod p
            = g^{r * sk_b} mod p
        Notice: The proxy learns NOTHING about m or g^r or private keys!
        """
        c1_prime = pow(c1, rk_a_to_b, self.p)
        return c1_prime, c2

    def decrypt_original(self, c1: int, c2: int, sk_a: int) -> int:
        """
        Patient A decrypts original ciphertext:
        g^r = (c1)^{1 / sk_a mod q} mod p
        m = c2 * (g^r)^{-1} mod p
        """
        inv_sk_a = pow(sk_a, -1, self.q)
        g_r = pow(c1, inv_sk_a, self.p)
        inv_g_r = pow(g_r, -1, self.p)
        m = (c2 * inv_g_r) % self.p
        return m

    def decrypt_re_encrypted(self, c1_prime: int, c2: int, sk_b: int) -> int:
        """
        Doctor B decrypts re-encrypted ciphertext:
        g^r = (c1')^{1 / sk_b mod q} mod p = (g^{r * sk_b})^{1 / sk_b mod q} mod p = g^r mod p
        m = c2 * (g^r)^{-1} mod p
        """
        inv_sk_b = pow(sk_b, -1, self.q)
        g_r = pow(c1_prime, inv_sk_b, self.p)
        inv_g_r = pow(g_r, -1, self.p)
        m = (c2 * inv_g_r) % self.p
        return m


class MedBlockCryptoPipeline:
    """
    Hybrid AES-256-GCM + BBS98 Proxy Re-Encryption Pipeline.
    Supports medical files, DICOM scans, and structured vitals payloads.
    """

    def __init__(self):
        self.pre = BBS98Engine()

    def encrypt_medical_record(
        self, file_bytes: bytes, patient_pk: int
    ) -> Dict[str, Any]:
        """
        1. Generates 256-bit symmetric DEK (Data Encryption Key).
        2. Encrypts file_bytes using AES-256-GCM.
        3. Encrypts DEK using BBS98 under patient_pk.
        4. Calculates SHA-256 integrity hash.
        """
        # Ensure DEK integer is strictly less than Q (256-bit prime)
        dek_int = 0
        while dek_int == 0 or dek_int >= self.pre.q:
            dek = AESGCM.generate_key(bit_length=256)
            dek_int = int.from_bytes(dek, byteorder="big")

        nonce = secrets.token_bytes(12)
        aesgcm = AESGCM(dek)
        encrypted_data = aesgcm.encrypt(nonce, file_bytes, None)

        c1, c2 = self.pre.encrypt(patient_pk, dek_int)
        data_hash = hashlib.sha256(encrypted_data).hexdigest()

        return {
            "ciphertext_hex": encrypted_data.hex(),
            "nonce_hex": nonce.hex(),
            "data_hash": data_hash,
            "c1_hex": hex(c1),
            "c2_hex": hex(c2),
            "file_size": len(file_bytes),
        }

    def proxy_transform(
        self, c1_hex: str, c2_hex: str, rk_hex: str
    ) -> Dict[str, str]:
        """
        Proxy re-encrypts the BBS98 encrypted DEK from Patient to Doctor.
        """
        c1 = int(c1_hex, 16)
        c2 = int(c2_hex, 16)
        rk = int(rk_hex, 16)

        c1_prime, c2_prime = self.pre.re_encrypt(c1, c2, rk)
        return {
            "c1_prime_hex": hex(c1_prime),
            "c2_hex": hex(c2_prime),
        }

    def doctor_decrypt_record(
        self,
        c1_prime_hex: str,
        c2_hex: str,
        doctor_sk: int,
        ciphertext_hex: str,
        nonce_hex: str,
    ) -> bytes:
        """
        Doctor decrypts the DEK using doctor_sk, then decrypts the medical record.
        """
        c1_prime = int(c1_prime_hex, 16)
        c2 = int(c2_hex, 16)

        recovered_dek_int = self.pre.decrypt_re_encrypted(c1_prime, c2, doctor_sk)
        recovered_dek = recovered_dek_int.to_bytes(32, byteorder="big")

        ciphertext = bytes.fromhex(ciphertext_hex)
        nonce = bytes.fromhex(nonce_hex)

        aesgcm = AESGCM(recovered_dek)
        plaintext = aesgcm.decrypt(nonce, ciphertext, None)
        return plaintext

    def patient_decrypt_record(
        self,
        c1_hex: str,
        c2_hex: str,
        patient_sk: int,
        ciphertext_hex: str,
        nonce_hex: str,
    ) -> bytes:
        """
        Patient decrypts their own record using their patient_sk.
        """
        c1 = int(c1_hex, 16)
        c2 = int(c2_hex, 16)

        recovered_dek_int = self.pre.decrypt_original(c1, c2, patient_sk)
        recovered_dek = recovered_dek_int.to_bytes(32, byteorder="big")

        ciphertext = bytes.fromhex(ciphertext_hex)
        nonce = bytes.fromhex(nonce_hex)

        aesgcm = AESGCM(recovered_dek)
        plaintext = aesgcm.decrypt(nonce, ciphertext, None)
        return plaintext


def run_self_test():
    print("=" * 75)
    print(" MedBlock-Share: BBS98 Proxy Re-Encryption Mathematical Self-Test")
    print(" (Section 6.1: Blaze-Bleumer-Strauss 1998 Formal Cryptographic Verification)")
    print("=" * 75)
    pipeline = MedBlockCryptoPipeline()

    # 1. Patient Alice and Doctor Bob Key Generation
    sk_alice, pk_alice = pipeline.pre.generate_keypair()
    sk_bob, pk_bob = pipeline.pre.generate_keypair()
    print(f"[+] Keygen: Patient Alice PK = {hex(pk_alice)[:26]}...")
    print(f"[+] Keygen: Doctor Bob PK    = {hex(pk_bob)[:26]}...")

    # 2. Re-Encryption Key Generation rk_{A -> B}
    rk_alice_to_bob = pipeline.pre.generate_rekey(sk_alice, sk_bob)
    print(f"[+] PRE Re-Key rk_{{A->B}}      = {hex(rk_alice_to_bob)[:26]}...")

    # 3. Medical Record Encryption
    sample_medical_record = (
        b"================ MEDBLOCK-SHARE EHR TELEMETRY ================\n"
        b"Patient ID: PT-90214-X | Name: Jane Doe | Age: 36\n"
        b"PhysioNet MIMIC-III Cluster: ICU Ward 4 - Bed 12\n"
        b"Acute Finding: Acute Myocardial Infarction (Anterior STEMI)\n"
        b"Telemetry: HR: 138 bpm | BP: 184/112 mmHg | SpO2: 89% | Trop-I: 4.8 ng/mL\n"
        b"Tele-Triage Order: Immediate Cardiac Cath Lab Activation + IV Heparin\n"
        b"=============================================================="
    )

    print(f"[*] Encrypting medical payload ({len(sample_medical_record)} bytes) under Alice's PK...")
    encrypted_record = pipeline.encrypt_medical_record(sample_medical_record, pk_alice)
    print(f"[+] Encrypted AES-GCM Ciphertext Hash: {encrypted_record['data_hash']}")
    print(f"[+] BBS98 C1: {encrypted_record['c1_hex'][:26]}...")
    print(f"[+] BBS98 C2: {encrypted_record['c2_hex'][:26]}...")

    # 4. Proxy Re-Encryption (Untrusted Cloud / IPFS Gateway)
    print(f"[*] Proxy performing re-encryption transformation using rk_{{A->B}}...")
    transformed = pipeline.proxy_transform(
        encrypted_record["c1_hex"],
        encrypted_record["c2_hex"],
        hex(rk_alice_to_bob),
    )
    print(f"[+] Transformed C1': {transformed['c1_prime_hex'][:26]}...")

    # 5. Doctor Bob Decryption
    print(f"[*] Doctor Bob decrypting transformed ciphertext using Bob's private key...")
    decrypted_record = pipeline.doctor_decrypt_record(
        transformed["c1_prime_hex"],
        transformed["c2_hex"],
        sk_bob,
        encrypted_record["ciphertext_hex"],
        encrypted_record["nonce_hex"],
    )

    assert decrypted_record == sample_medical_record, "Cryptographic decryption mismatch!"
    print("[SUCCESS] Doctor Bob decrypted medical record matches original bit-for-bit!")

    # 6. Patient Alice Decryption
    patient_decrypted = pipeline.patient_decrypt_record(
        encrypted_record["c1_hex"],
        encrypted_record["c2_hex"],
        sk_alice,
        encrypted_record["ciphertext_hex"],
        encrypted_record["nonce_hex"],
    )
    assert patient_decrypted == sample_medical_record, "Patient self-decryption mismatch!"
    print("[SUCCESS] Patient Alice self-decrypted record also verified!")

    print("\nDecrypted Plaintext Output Preview:")
    print(decrypted_record.decode("utf-8"))
    print("=" * 75)


if __name__ == "__main__":
    run_self_test()
