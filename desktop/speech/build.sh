#!/bin/sh
set -eu
speech_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
output_dir="$speech_dir/../dist/speech"
mkdir -p "$output_dir"
arch=$(uname -m)
xcrun --sdk macosx swiftc -swift-version 5 -O -target "$arch-apple-macos12.0" \
  -Xlinker -sectcreate -Xlinker __TEXT -Xlinker __info_plist -Xlinker "$speech_dir/Info.plist" \
  "$speech_dir/Authorization.swift" "$speech_dir/main.swift" -o "$output_dir/mosic-speech"
