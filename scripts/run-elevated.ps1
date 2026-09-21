# Raw packet capture (WinPcap/Npcap) needs an elevated process on Windows.
# Run this from an elevated PowerShell (or let npm's electron:admin script
# trigger the UAC prompt for you). --remote-debugging-port opens a CDP
# endpoint on localhost:9333 for scripted verification (see cdp-verify.mjs) —
# harmless for local dev, remove the flag if you don't want it.
Get-Process electron -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500
Remove-Item "C:\Users\bakuw\Desktop\pulse\crash.log" -ErrorAction SilentlyContinue
$electronExe = "C:\Users\bakuw\Desktop\pulse\node_modules\electron\dist\electron.exe"
Start-Process -FilePath $electronExe -ArgumentList "electron\main.js", "--remote-debugging-port=9333" -WorkingDirectory "C:\Users\bakuw\Desktop\pulse"
