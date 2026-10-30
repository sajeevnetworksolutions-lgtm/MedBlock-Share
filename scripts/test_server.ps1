$proc = Start-Process -FilePath "node" -ArgumentList "C:\Users\91990\.gemini\antigravity\scratch\medblock-share\server\app_server.js" -PassThru -NoNewWindow
Start-Sleep -Seconds 3

try {
    Write-Output "--- 1. Testing /api/health ---"
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:4000/api/health"
    $health | ConvertTo-Json

    Write-Output "`n--- 2. Testing /api/benchmark ---"
    $bench = Invoke-RestMethod -Uri "http://127.0.0.1:4000/api/benchmark"
    Write-Output "Sample records: $($bench.sample_records)"
    Write-Output "Emergency SOS Latency (Mean): $($bench.tele_triage_sos_latencies_ms.mean) ms"
    Write-Output "Tamper Alert Gas Consumed: $($bench.tamper_alert_gas.consumed) gas"

    Write-Output "`n--- 3. Testing /api/records ---"
    $records = Invoke-RestMethod -Uri "http://127.0.0.1:4000/api/records"
    Write-Output "Records count: $($records.Count)"
    Write-Output "First record ID: $($records[0].recordId)"

    Write-Output "`n--- 4. Testing 1-Click SOS Trigger ---"
    $sosBody = @{
        patient = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
        doctor = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
        clientTimestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() - 25
    } | ConvertTo-Json

    $sosRes = Invoke-RestMethod -Uri "http://127.0.0.1:4000/api/sos/trigger" -Method Post -Body $sosBody -ContentType "application/json"
    Write-Output "SOS Call ID: $($sosRes.alert.callId)"
    Write-Output "Measured Latency: $($sosRes.alert.latencyMs) ms"
    Write-Output "Latency Compliant (< 380 ms): $($sosRes.alert.isCompliant)"

    Write-Output "`n--- 5. Testing Unauthorized Tamper Intrusion ---"
    $tamperBody = @{
        attackerWallet = "0x90F79bf6EB2c4f870365E785982E1f101E93b906"
        recordId = "EHR-2026-9041"
        fakeCID = "QmTamperedMaliciousFake000000000000000000"
        proxyGatewayIP = "194.26.29.112:8080 (Tor-Exit)"
        attackVector = "UNAUTHORIZED_RECORD_OVERWRITE_INJECTION"
    } | ConvertTo-Json

    $tamperRes = Invoke-RestMethod -Uri "http://127.0.0.1:4000/api/tamper/simulate" -Method Post -Body $tamperBody -ContentType "application/json"
    Write-Output "Tamper Reverted: $($tamperRes.reverted)"
    Write-Output "Revert Reason: $($tamperRes.reason)"
    Write-Output "Gas Used: $($tamperRes.event.gasUsed) gas (Bound: $($tamperRes.event.gasBound) gas)"
    Write-Output "Gas Compliant: $($tamperRes.event.compliantGasBound)"

    Write-Output "`n--- 6. Testing BBS98 Proxy Re-Encryption Decryption ---"
    $decryptBody = @{
        recordId = "EHR-2026-9041"
    } | ConvertTo-Json

    $decRes = Invoke-RestMethod -Uri "http://127.0.0.1:4000/api/crypto/doctor-decrypt" -Method Post -Body $decryptBody -ContentType "application/json"
    Write-Output "Decryption Success: $($decRes.success)"
    Write-Output "Decrypted Content Preview: $($decRes.plaintext.Substring(0, 100))..."
}
catch {
    Write-Error $_
}
finally {
    Stop-Process -Id $proc.Id -Force
}
