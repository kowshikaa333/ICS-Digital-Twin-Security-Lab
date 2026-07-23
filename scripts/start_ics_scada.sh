#!/bin/bash
echo "=== INITIALIZING ICS DIGITAL TWIN STACK ==="

sudo kill -9 $(sudo lsof -t -i:3000) 2>/dev/null
