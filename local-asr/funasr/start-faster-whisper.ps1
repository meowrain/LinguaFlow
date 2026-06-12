#Requires -Version 7
$ErrorActionPreference = "Stop"

$ScriptDir = $PSScriptRoot
Set-Location $ScriptDir

# --- 配置（环境变量优先，否则用默认值）---
$MODEL_DIR = if ($env:MODEL_DIR) { $env:MODEL_DIR } else { "$ScriptDir\models\faster-whisper-large-v3" }
# DEVICE / COMPUTE_TYPE 不在此设默认值，由 faster_whisper_server.py 自动检测

$CPU_THREADS = if ($env:CPU_THREADS) { $env:CPU_THREADS } else { [Environment]::ProcessorCount }
$BEAM_SIZE = if ($env:BEAM_SIZE) { $env:BEAM_SIZE } else { "1" }
$NUM_WORKERS = if ($env:NUM_WORKERS) { $env:NUM_WORKERS } else { "1" }
$VAD_FILTER = if ($env:VAD_FILTER) { $env:VAD_FILTER } else { "true" }
$VAD_MIN_SILENCE_MS = if ($env:VAD_MIN_SILENCE_MS) { $env:VAD_MIN_SILENCE_MS } else { "500" }
$CONDITION_ON_PREVIOUS_TEXT = if ($env:CONDITION_ON_PREVIOUS_TEXT) { $env:CONDITION_ON_PREVIOUS_TEXT } else { "false" }
$NO_SPEECH_THRESHOLD = if ($env:NO_SPEECH_THRESHOLD) { $env:NO_SPEECH_THRESHOLD } else { "0.6" }
$LOG_PROB_THRESHOLD = if ($env:LOG_PROB_THRESHOLD) { $env:LOG_PROB_THRESHOLD } else { "-1.0" }
$COMPRESSION_RATIO_THRESHOLD = if ($env:COMPRESSION_RATIO_THRESHOLD) { $env:COMPRESSION_RATIO_THRESHOLD } else { "2.4" }
$ListenHost = if ($env:WHISPER_HOST) { $env:WHISPER_HOST } else { "127.0.0.1" }
$Port = if ($env:WHISPER_PORT) { $env:WHISPER_PORT } else { "8899" }

# --- 代理（按需修改）---
$PROXY = if ($env:http_proxy) { $env:http_proxy } else { "http://127.0.0.1:7897" }
$env:http_proxy  = $PROXY
$env:https_proxy = $PROXY
$env:HTTP_PROXY  = $PROXY
$env:HTTPS_PROXY = $PROXY

$env:HF_HUB_DISABLE_XET = if ($env:HF_HUB_DISABLE_XET) { $env:HF_HUB_DISABLE_XET } else { "1" }
$env:UV_HTTP_TIMEOUT    = if ($env:UV_HTTP_TIMEOUT)    { $env:UV_HTTP_TIMEOUT }    else { "300" }

# --- 导出到子进程 ---
$env:MODEL_DIR          = $MODEL_DIR
$env:CPU_THREADS        = $CPU_THREADS
$env:BEAM_SIZE          = $BEAM_SIZE
$env:NUM_WORKERS        = $NUM_WORKERS
$env:VAD_FILTER         = $VAD_FILTER
$env:VAD_MIN_SILENCE_MS = $VAD_MIN_SILENCE_MS
$env:CONDITION_ON_PREVIOUS_TEXT = $CONDITION_ON_PREVIOUS_TEXT
$env:NO_SPEECH_THRESHOLD        = $NO_SPEECH_THRESHOLD
$env:LOG_PROB_THRESHOLD         = $LOG_PROB_THRESHOLD
$env:COMPRESSION_RATIO_THRESHOLD = $COMPRESSION_RATIO_THRESHOLD

# DEVICE / COMPUTE_TYPE：仅在用户显式设置时才 export，否则让 Python 自动检测
if ($env:DEVICE)       { } else { Remove-Item Env:\DEVICE       -ErrorAction SilentlyContinue }
if ($env:COMPUTE_TYPE) { } else { Remove-Item Env:\COMPUTE_TYPE -ErrorAction SilentlyContinue }

# --- 检查模型目录 ---
if (-not (Test-Path $MODEL_DIR -PathType Container)) {
    Write-Host "Model directory not found: $MODEL_DIR" -ForegroundColor Red
    Write-Host "Expected a CTranslate2 faster-whisper model, for example models\faster-whisper-large-v3."
    exit 1
}

# --- 同步 .env（如有 sync-env 脚本）---
$syncEnv = Join-Path $ScriptDir "sync-env.sh"
if (Test-Path $syncEnv) {
    Write-Host "[INFO] Skipping sync-env.sh (bash script) on Windows. Set env vars manually if needed." -ForegroundColor Yellow
}

# --- 启动服务 ---
Write-Host "[ASR] Starting faster-whisper server on ${ListenHost}:${Port}" -ForegroundColor Cyan
Write-Host "[ASR] MODEL_DIR = $MODEL_DIR" -ForegroundColor Cyan

uv run uvicorn faster_whisper_server:app `
    --host $ListenHost `
    --port $Port
