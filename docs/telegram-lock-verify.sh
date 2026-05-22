#!/bin/bash
# Verification script for Telegram polling lock fix
# Run after restarting Pi to confirm only one process is polling

set -e

echo "=== Telegram Polling Lock Verification ==="
echo

# Check running Pi processes
echo "1. Checking running Pi processes:"
pi_count=$(ps aux | grep -E "^\w+\s+\d+.*\spi\s*$" | grep -v grep | wc -l | tr -d ' ')
echo "   Found $pi_count Pi process(es)"
ps aux | grep -E "^\w+\s+\d+.*\spi\s*$" | grep -v grep || echo "   (none)"
echo

# Check lock file
echo "2. Checking polling lock:"
if [ -f .pi/state/telegram/_poll.lock ]; then
    echo "   Lock file exists:"
    cat .pi/state/telegram/_poll.lock | sed 's/^/   /'
    
    # Extract PID and check if it's alive
    lock_pid=$(cat .pi/state/telegram/_poll.lock | grep '"pid"' | grep -o '[0-9]\+')
    if kill -0 "$lock_pid" 2>/dev/null; then
        echo "   ✓ Lock PID $lock_pid is alive"
    else
        echo "   ✗ Lock PID $lock_pid is NOT running (stale lock)"
    fi
else
    echo "   ✗ Lock file not found at .pi/state/telegram/_poll.lock"
    echo "   (This is expected if Telegram bot has not started yet)"
fi
echo

# Check for TELEGRAM_BOT_TOKEN
echo "3. Checking environment:"
if [ -n "$TELEGRAM_BOT_TOKEN" ]; then
    echo "   ✓ TELEGRAM_BOT_TOKEN is set"
else
    echo "   ✗ TELEGRAM_BOT_TOKEN is not set"
fi
echo

echo "=== Instructions ==="
echo "• If you see multiple Pi processes, the lock may not be working."
echo "• Send a test message to the Telegram bot."
echo "• Check Pi TUI for '409' or 'getUpdates conflict' warnings."
echo "• If warnings appear, check .pi/extensions/telegram-bot/index.ts"
echo "  line ~477 to ensure the lock logic is present."
