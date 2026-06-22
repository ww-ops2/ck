<#
.SYNOPSIS
  Push inventory management files to GitHub via Contents API
  
.NOTES
  网络问题：git push 无法连接 github.com:443（连接超时）
  解决方案：使用 GitHub REST API (api.github.com) 推送，绕过 git 协议
  参考来源：V3 数据看板 scripts/push-v3.ps1
  
  编码问题：PowerShell Get-Content/Set-Content 会破坏中文 UTF-8 编码
  解决方案：使用 [System.IO.File]::ReadAllText + UTF8Encoding $true (BOM)
  参考来源：V3 数据看板 docs/ENCODING_FIX.md, docs/PROJECT_RULES.md
  
  运行方式：
  powershell -ExecutionPolicy Bypass -File "push.ps1" "C:/Users/Administrator/Desktop/KingdeeVoucherAuto/3-库存管理"
  
  备选方案（单 commit 批量推送）：
  使用 workspace 中的 push_api.py（Git Data API），一次 commit 推送所有文件
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

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Inventory System - GitHub API Push" -ForegroundColor Cyan
Write-Host "  Repo: $owner/$repo" -ForegroundColor Cyan
Write-Host "  Root: $projectDir" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ===== 推送文件列表 =====
# 如需新增文件，在此数组中添加即可
$filesToPush = @(
    ".gitignore",
    "index.html",
    "css/style.css",
    "database/schema.sql",
    "database/migrations/20260616_add_adjustments_permissions.sql",
    "database/migrations/20260622_change_stock_to_numeric.sql",
    "js/admin-bindings.js",
    "js/app.js",
    "js/auth.js",
    "js/auth-fix.js",
    "js/auth-fixed.js",
    "js/business-flow.js",
    "js/inventory-hybrid.js",
    "js/login-characters.js",
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

# ===== 编码：必须使用 UTF-8 BOM =====
# 参考 V3 docs/ENCODING_FIX.md：
# Get-Content/Set-Content 会破坏中文，必须用 [System.IO.File]::ReadAllText
# UTF8Encoding $true = 带 BOM，确保多字节中文字符不被截断/替换为 '?'
$utf8WithBom = New-Object System.Text.UTF8Encoding $true
$successCount = 0
$failCount = 0
$skipCount = 0
$totalSize = 0

foreach ($relPath in $filesToPush) {
    $fullPath = [System.IO.Path]::Combine($projectDir, $relPath.Replace('/', '\'))
    
    if (-not (Test-Path $fullPath)) {
        Write-Host "  SKIP $relPath (not found)" -ForegroundColor Yellow
        $skipCount++
        continue
    }
    
    # 使用 UTF-8 BOM 读取，保留中文字符完整性
    $contentText = [System.IO.File]::ReadAllText($fullPath, $utf8WithBom)
    $contentBytes = $utf8WithBom.GetBytes($contentText)
    $b64 = [Convert]::ToBase64String($contentBytes)
    $localSize = $contentBytes.Length
    $totalSize += $localSize
    
    # 查询远程文件 SHA（用于更新）
    $cloudSha = $null
    try {
        $resp = Invoke-RestMethod -Uri "$apiBase/contents/$relPath" -Headers $headers -Method Get -ErrorAction Stop
        $cloudSha = $resp.sha
    } catch {}
    
    $msg = "v5.35 " + $(if ($cloudSha) { "update" } else { "add" }) + " $relPath"
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
    
    # 间隔 500ms 避免 API 限流
    Start-Sleep -Milliseconds 500
}

Write-Host ""
Write-Host "========================================" -ForegroundColor $(if ($failCount -eq 0) { "Green" } else { "Yellow" })
$totalKB = [math]::Round($totalSize / 1024, 1)
Write-Host "  Result: $successCount OK, $failCount FAIL, $skipCount SKIP" -ForegroundColor $(if ($failCount -eq 0) { "Green" } else { "Yellow" })
Write-Host "  Total: $totalKB KB | Files: $($filesToPush.Count)" -ForegroundColor White
Write-Host "========================================" -ForegroundColor $(if ($failCount -eq 0) { "Green" } else { "Yellow" })
Write-Host "Pages: https://$owner.github.io/$repo/" -ForegroundColor Cyan
Write-Host "Will update in 1-2 minutes" -ForegroundColor Yellow
