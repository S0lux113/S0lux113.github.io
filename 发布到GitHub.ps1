# 发布博客到 GitHub
# 用法：在本文件夹打开 PowerShell，执行：
#   powershell -ExecutionPolicy Bypass -File .\发布到GitHub.ps1
# 或者右键用 PowerShell 运行。

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "=== 发布博客到 GitHub ===" -ForegroundColor Cyan
Write-Host ""

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Host "没有找到 git，请先安装 Git for Windows：https://git-scm.com/download/win" -ForegroundColor Red
  Read-Host "按回车关闭"
  exit 1
}

if (-not (Test-Path ".git")) {
  git init -b main
  Write-Host "已初始化本地仓库（main 分支）" -ForegroundColor DarkGray
}

$repo = Read-Host "粘贴仓库地址（例：https://github.com/S0lux113/S0lux113.github.io.git）"
if ([string]::IsNullOrWhiteSpace($repo)) {
  Write-Host "没有填写仓库地址，已取消。" -ForegroundColor Yellow
  Read-Host "按回车关闭"
  exit 1
}

if (-not (git config user.name)) {
  $name = Read-Host "你的 GitHub 用户名（用于提交记录，可留空）"
  if ($name) { git config user.name $name }
}
if (-not (git config user.email)) {
  $email = Read-Host "你的邮箱（可填 用户名@users.noreply.github.com，可留空）"
  if ($email) { git config user.email $email }
}

$remotes = git remote
if ($remotes -contains "origin") {
  git remote set-url origin $repo
  Write-Host "已更新 origin 地址" -ForegroundColor DarkGray
} else {
  git remote add origin $repo
  Write-Host "已关联 origin" -ForegroundColor DarkGray
}

git add -A
git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
  Write-Host "没有新的修改，直接推送。" -ForegroundColor DarkGray
} else {
  $msg = "更新博客 " + (Get-Date -Format "yyyy-MM-dd HH:mm")
  git commit -m $msg
}

Write-Host ""
Write-Host "即将推送。如果弹出 GitHub 登录窗口，登录后点 Authorize 即可。" -ForegroundColor Cyan
git push -u origin main

if ($LASTEXITCODE -eq 0) {
  Write-Host ""
  Write-Host "推送成功！" -ForegroundColor Green
  Write-Host "如果已经开启 GitHub Pages，等 1 分钟刷新线上网址即可。" -ForegroundColor Green
} else {
  Write-Host ""
  Write-Host "推送失败：把上面的报错发给我，或者检查仓库地址和登录状态。" -ForegroundColor Red
}

Read-Host "按回车关闭"
