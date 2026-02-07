#!/bin/bash
export PATH=$HOME/.cargo/bin:$PWD/.bootstrap/bin:$PATH
export COREPACK_ENABLE_STRICT=0
corepack enable
"$@"
