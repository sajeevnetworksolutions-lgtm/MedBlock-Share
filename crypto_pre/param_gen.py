import sympy
import secrets

print("Searching for 256-bit safe prime p = 2q + 1...")
# Generate 256-bit prime q such that p = 2q + 1 is prime
while True:
    q = sympy.randprime(2**255, 2**256)
    p = 2 * q + 1
    if sympy.isprime(p):
        break

print(f"p = {hex(p)}")
print(f"q = {hex(q)}")

# Find generator g of order q in Z_p*
# Any quadratic residue h^2 mod p has order q (since h^(2q) = h^(p-1) = 1)
for h in range(2, 100):
    g = pow(h, 2, p)
    if g != 1 and pow(g, q, p) == 1:
        print(f"g = {g}")
        break

# Test BBS98
sk_a = secrets.randbelow(q - 3) + 2
pk_a = pow(g, sk_a, p)

sk_b = secrets.randbelow(q - 3) + 2
pk_b = pow(g, sk_b, p)

rk = (sk_b * pow(sk_a, -1, q)) % q

m = 12345678901234567890
r = secrets.randbelow(q - 3) + 2

# Patient Alice encrypts: C_A = (c1, c2) = (g^{r * sk_a} mod p, m * g^r mod p)
c1 = pow(pk_a, r, p)  # (g^{sk_a})^r = g^{r * sk_a}
g_r = pow(g, r, p)
c2 = (m * g_r) % p

# Untrusted Proxy transforms: C_B = (c1', c2) = (c1^rk mod p, c2)
c1_prime = pow(c1, rk, p)

# Doctor Bob decrypts:
# g^r = (c1')^{1 / sk_b mod q} mod p
inv_sk_b = pow(sk_b, -1, q)
recovered_g_r = pow(c1_prime, inv_sk_b, p)
inv_rec_g_r = pow(recovered_g_r, -1, p)
recovered_m = (c2 * inv_rec_g_r) % p

print("Direct g^r == Recovered g^r:", g_r == recovered_g_r)
print("Original m == Recovered m:", m == recovered_m)
