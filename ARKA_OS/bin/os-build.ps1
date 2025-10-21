$ErrorActionPreference = "Stop"
node (Join-Path $PSScriptRoot "../bin/os-build.mjs")
