<#
.SYNOPSIS
  Push inventory management files to GitHub via Contents API
#>
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$Token = $env:GITHUB_TOKEN
if ([string]::IsNullOrWhiteSpace($Token)) {
    Write-Host "ERROR: GITHUB_TOKEN environment variable not set" -ForegroundColor Red
    exit 1
}
$owner = "ww-ops2"
$repo = "ck"
$apiBase = "https://api.github.com/repos/$owner/$repo"

$headers = @{
    "Authorization" = "Bearer $Token"
    "Accept"        = "application/vnd.github+json"
    "User-Agent"    = "inventory-sync"
}

# Get project dir from args or auto-detect
if ($args.Count -gt 0) {
    $projectDir = $args[0]
} else {
    $projectDir = $env:PROJECT_DIR
}

if ([string]::IsNullOrWhiteSpace($projectDir) -or -not (Test-Path $projectDir)) {
    Write-Host "ERROR: Project directory not found: $projectDir" -ForegroundColor Red
    exit 1
}

Write-Host "Root: $projectDir"

$filesToPush = @(
    ".gitignore",
    "index.html",
    "css/style.css",
    "database/schema.sql",
    "database/migrations/20260616_add_adjustments_permissions.sql",
    "js/admin-bindings.js",
    "js/app.js",
    "js/auth.js",
    "js/auth-fix.js",
    "js/auth-fixed.js",
    "js/business-flow.js",
    "js/migrate-data.js",
    "js/monthly-summary.js",
    "js/navigation.js",
    "js/purchase.js",
    "js/requisition.js",
    "js/role-admin.js",
    "js/stock-in.js",
    "js/supabase-db.js",
    "js/supabase-sync.js",
    "js/toast.js",
    "js/tour-reports.js",
    "js/user-admin.js",
    "package.json",
    "push.ps1",
    "CHANGELOG.md",
    "PROJECT_BRIEF.md",
    "PROJECT_DIRECTORY.md",
    "README.md",
    "TIPS.md",
    "打开库存管理系统.bat"
)

$utf8NoBom = New-Object System.Text.UTF8Encoding $false
$successCount = 0
$failCount = 0
$totalSize = 0

foreach ($relPath in $filesToPush) {
    $fullPath = [System.IO.Path]::Combine($projectDir, $relPath.Replace('/', '\'))
    
    if (-not (Test-Path $fullPath)) {
        Write-Host "  SKIP $relPath (not found)" -ForegroundColor Yellow
        continue
    }
    
    $contentText = [System.IO.File]::ReadAllText($fullPath, $utf8NoBom)
    $contentBytes = $utf8NoBom.GetBytes($contentText)
    $b64 = [Convert]::ToBase64String($contentBytes)
    $localSize = $contentBytes.Length
    $totalSize += $localSize
    
    $cloudSha = $null
    try {
        $resp = Invoke-RestMethod -Uri "$apiBase/contents/$relPath" -Headers $headers -Method Get -ErrorAction Stop
        $cloudSha = $resp.sha
    } catch {}
    
    $msg = "v5.9 " + $(if ($cloudSha) { "update" } else { "add" }) + " $relPath"
    $body = @{
        message = $msg
        content = $b64
    }
    if ($cloudSha) { $body.sha = $cloudSha }
    
    $bodyJson = $body | ConvertTo-Json -Depth 3
    
    try {
        $response = Invoke-RestMethod `
            -Uri "$apiBase/contents/$relPath" `
            -Headers $headers `
            -Method Put `
            -Body $bodyJson `
            -ContentType "application/json" `
            -ErrorAction Stop
        
        $action = if ($cloudSha) { "UPDATE" } else { "CREATE" }
        $sizeKB = [math]::Round($localSize / 1024, 1)
        Write-Host "  OK   $relPath ($sizeKB KB) [$action]" -ForegroundColor Green
        $successCount++
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        Write-Host "  FAIL $relPath - HTTP $statusCode" -ForegroundColor Red
        $failCount++
    }
    
    Start-Sleep -Milliseconds 500
}

Write-Host ""
$totalKB = [math]::Round($totalSize / 1024, 1)
Write-Host "Result: $successCount OK, $failCount FAIL | Total: $totalKB KB" -ForegroundColor $(if ($failCount -eq 0) { "Green" } else { "Yellow" })
Write-Host "Pages: https://$owner.github.io/$repo/" -ForegroundColor Cyan
