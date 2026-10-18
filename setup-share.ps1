#Requires -Version 5.1
<#
    DSM 공유 폴더 'share' 생성 스크립트

    - 비밀번호는 대화형 입력만 받으므로 대화 기록에 남지 않습니다.
    - 세션 쿠키를 유지하며 Web API를 순차 호출합니다.
    - 이미 폴더가 있으면 건너뛰므로 중복 실행해도 안전합니다.
#>

$ErrorActionPreference = 'Stop'

$NasHost   = '192.168.45.132'
$Api       = 'https://192.168.45.132:5001'
$ShareName = 'share'

# PowerShell 5.1 은 Invoke-RestMethod 가 HttpWebRequest 를 사용하므로
# ServicePointManager 를 통해 자체 서명 인증서(DSM)를 무시합니다.
[System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
[System.Net.ServicePointManager]::SecurityProtocol = `
    [System.Net.SecurityProtocolType]::Tls12 -bor `
    [System.Net.SecurityProtocolType]::Tls11

function Step($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "    [OK]  $m" -ForegroundColor Green }
function Info($m) { Write-Host "    [i]   $m" -ForegroundColor Gray }
function Err($m)  { Write-Host "    [ERR] $m" -ForegroundColor Red }

Write-Host ""
Write-Host "==================================================" -ForegroundColor Yellow
Write-Host "  DSM 공유 폴더 '$ShareName' 생성" -ForegroundColor Yellow
Write-Host "==================================================" -ForegroundColor Yellow

# ------------------------------------------------------------------ 1. 인증
Step "DSM 관리자 계정으로 로그인"

$account = Read-Host 'DSM 계정 (예: oocssi)'
if ([string]::IsNullOrWhiteSpace($account)) { Err "계정이 비어 있습니다."; exit 1 }

$secure = Read-Host '비밀번호' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
    $passwd = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
}

$web = New-Object Microsoft.PowerShell.Commands.WebRequestSession

function Call-Dsm {
    param(
        [Parameter(Mandatory)][hashtable]$Body,
        [int]$TimeoutSec = 300
    )
    Invoke-RestMethod -Uri "$Api/webapi/entry.cgi" `
        -Method Post -Body $Body -WebSession $web -TimeoutSec $TimeoutSec
}

try {
    $auth = Call-Dsm -Body @{
        api     = 'SYNO.API.Auth'
        version = 7
        method  = 'login'
        account = $account
        passwd  = $passwd
        session = 'FileStation'
        format  = 'sid'
    } -TimeoutSec 120
} finally {
    $passwd = $null
}

if ($auth.success -ne $true) {
    Err "로그인 실패 (코드 $($auth.error.code))"
    Info "2단계 인증이 켜져 있으면 DSM 화면에서 '일반 비밀번호 로그인'을 먼저 수행하세요."
    exit 1
}
$sid = $auth.data.sid
Ok "로그인 성공 (SID $($sid.Substring(0,10))...)"

# ------------------------------------------------------------------ 2. 목록
Step "기존 공유 폴더 목록 확인"

$list = Call-Dsm -Body @{
    api = 'SYNO.Core.Share'; version = 1; method = 'list'; _sid = $sid
} -TimeoutSec 180

if ($list.success -ne $true) { Err "목록 조회 실패 (코드 $($list.error.code))"; exit 1 }

$existing = @($list.data.shares | ForEach-Object { $_.name })
Ok ("현재 폴더: " + ($existing -join ', '))

# ------------------------------------------------------------------ 3. 생성
if ($existing -contains $ShareName) {
    Ok "'$ShareName' 이(가) 이미 있습니다. 생성 단계를 건너뜁니다."
} else {
    Step "공유 폴더 '$ShareName' 생성"

    $create = Call-Dsm -Body @{
        api = 'SYNO.Core.Share'; version = 1; method = 'create'; _sid = $sid
        name        = $ShareName
        description = 'Tailscale 공용 공유 폴더'
    } -TimeoutSec 600

    if ($create.success -ne $true) {
        Err "생성 실패 (코드 $($create.error.code))"
        Info "제어판 > 로그 센터에서 상세 원인을 확인할 수 있습니다."
    } else {
        Ok "'$ShareName' 생성 완료"
    }
}

# ------------------------------------------------------------------ 4. 권한
Step "'$ShareName' 권한(ACL) 확인"

$perm = Call-Dsm -Body @{
    api = 'SYNO.Core.Share'; version = 1; method = 'get'; _sid = $sid
    name = $ShareName
} -TimeoutSec 180

if ($perm.success -eq $true) {
    foreach ($p in $perm.data.share.permission) {
        Info ("ACL : {0} / {1} / {2}" -f $p.perm_username, $p.perm, $p.perm_acl)
    }
} else {
    Err "권한 조회 실패 (코드 $($perm.error.code))"
}

# ------------------------------------------------------------------ 5. 종료
try {
    Call-Dsm -Body @{ api='SYNO.API.Auth'; version=7; method='logout'; _sid=$sid } -TimeoutSec 60 | Out-Null
    Ok "로그아웃"
} catch { }

Write-Host ""
Write-Host "==================================================" -ForegroundColor Green
Write-Host "  완료" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
Write-Host ""
Write-Host "다음 단계:" -ForegroundColor Cyan
Write-Host "  1) 방화벽에서 Tailscale 인터페이스 SMB 허용 확인" -ForegroundColor Gray
Write-Host "     DSM : 제어판 > 보안 > 방화벽 > 편집 > 인터페이스 탭" -ForegroundColor Gray
Write-Host "  2) 공유 폴더 확인 (File Station)" -ForegroundColor Gray
Write-Host ""