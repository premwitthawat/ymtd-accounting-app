# สร้าง ../ymtd-processes.drawio ใหม่จาก build.cjs แล้ว export PNG ทุกหน้าลง ../png
# ต้องมี Node และ draw.io desktop (ติดตั้งที่ %LOCALAPPDATA%\Programs\draw.io)
param([int]$from = 1, [int]$to = 99)
$gen = $PSScriptRoot
$out = Join-Path $gen "..\ymtd-processes.drawio"
$pngDir = Join-Path $gen "..\png"
node "$gen\build.cjs" $out
$exe = "$env:LOCALAPPDATA\Programs\draw.io\draw.io.exe"
$names = @(
  "00-overview", "01-login", "02-users-line-id", "03-company-setup", "04-line-group-link",
  "05-monthly-filing-tasks", "06-payment-notice-reminders", "07-slip-review-clear",
  "08-filing-receipt-flowaccount", "09-monthly-invoices", "10-invoice-paid-auto-receipt", "11-deploy-go-live"
)
$n = ([xml](Get-Content $out -Encoding UTF8)).mxfile.diagram.Count
if ($null -eq $n) { $n = 1 }
$to = [Math]::Min($to, $n)
foreach ($i in $from..$to) {
  $png = Join-Path $pngDir ("{0}.png" -f $names[$i - 1])
  # -p นับหน้าจาก 1 ใน draw.io >= 27.0.2 (รุ่นเก่านับจาก 0)
  Start-Process -FilePath $exe -ArgumentList @('-x', '-f', 'png', '-p', "$i", '-s', '1.1', '-o', "`"$png`"", "`"$out`"") -Wait -NoNewWindow | Out-Null
}
