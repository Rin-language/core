#!/bin/sh
# Runs a command (by default the test suite) in a Linux network namespace that
# has only the loopback interface, after checking that the network is cut.
# Needs sudo and the `ip` and `setpriv` tools (present on GitHub's Ubuntu
# runners). On another system use a container: see docs/ci.md.
set -eu

if [ "$(uname -s)" != "Linux" ]; then
  echo "run-tests-offline.sh needs Linux; see docs/ci.md for the container way." >&2
  exit 2
fi
if [ "$#" -eq 0 ]; then set -- pnpm test; fi

user_id=$(id -u)
group_id=$(id -g)
# Root (a container) needs no sudo.
if [ "$user_id" -eq 0 ]; then as_root=""; else as_root="sudo"; fi
# shellcheck disable=SC2086
exec $as_root env "PATH=$PATH" "HOME=$HOME" unshare --net -- sh -c '
  set -eu
  user_id=$1; group_id=$2; shift 2
  ip link set lo up
  setpriv --reuid="$user_id" --regid="$group_id" --clear-groups node scripts/assert-offline.mjs
  exec setpriv --reuid="$user_id" --regid="$group_id" --clear-groups "$@"
' sh "$user_id" "$group_id" "$@"
