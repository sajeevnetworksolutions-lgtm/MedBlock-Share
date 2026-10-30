import sys
import os
sys.path.append(os.path.dirname(__file__))

from bbs98_pre import BBS98Engine

pre = BBS98Engine()
sk_a, pk_a = pre.generate_keypair()
sk_b, pk_b = pre.generate_keypair()

rk = pre.generate_rekey(sk_a, sk_b)
m = 123456789
c1, c2 = pre.encrypt(pk_a, m)

# Original decryption
m_orig = pre.decrypt_original(c1, c2, sk_a)
print("Original decryption match:", m == m_orig)

# Re-encrypted decryption
c1_p, c2_p = pre.re_encrypt(c1, c2, rk)
m_rec = pre.decrypt_re_encrypted(c1_p, c2_p, sk_b)
print("Original:", m)
print("Recovered:", m_rec)
print("Match:", m == m_rec)
