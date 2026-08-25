#!/bin/bash
# Count interfold p2p peers currently exchanging traffic.
#
# interfold has no peer-count command (net only offers get-peer-id) and exposes
# no metrics endpoint, so we sample the wire. Peers are QUIC/UDP on 9091, which
# `ss` cannot enumerate (one connectionless socket serves every peer).
#
# Usage: ./interfold-peers.sh [seconds] [options]     (default 10; needs sudo for tcpdump)
#   -j, --json            print a JSON report instead of the human summary
#   -o, --out FILE        also write the JSON report to FILE (e.g. a web-served path)
#   -u, --upload URL      also POST the JSON report to URL (Content-Type: application/json)
#   -O, --operator ADDR   operator key to stamp into the report (default: `interfold wallet get`)
#
# The JSON is what the Ciphernode Console reads (My Nodes → Peers). Run it on a timer, e.g.
#   */5 * * * * /path/interfold-peers.sh 10 -o /var/www/html/peers.json
# and point the console at the resulting URL.

SECS=10
JSON=0
OUT=""
UPLOAD=""
OPERATOR=""
while [ $# -gt 0 ]; do
  case "$1" in
    -j|--json) JSON=1 ;;
    -o|--out) OUT="$2"; shift ;;
    -u|--upload) UPLOAD="$2"; shift ;;
    -O|--operator) OPERATOR="$2"; shift ;;
    -h|--help) sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) SECS="$1" ;;
  esac
  shift
done

TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT

[ "$JSON" = 1 ] || echo "sampling UDP 9091 for ${SECS}s..."
sudo timeout "$SECS" tcpdump -i any -nn udp port 9091 2>/dev/null > "$TMP"

IN=$(grep " In "  "$TMP" | grep -oE 'IP [0-9.]+\.[0-9]+ >'  | awk '{print $2}' | sed 's/\.[0-9]*$//' | sort -u)
OUT_PEERS=$(grep " Out " "$TMP" | grep -oE '> [0-9.]+\.[0-9]+:' | awk '{print $2}' | sed 's/\.[0-9]*:$//' | sort -u)
ALL=$(printf '%s\n%s\n' "$IN" "$OUT_PEERS" | grep -v '^$' | sort -u)

n_all=$(printf '%s\n' "$ALL" | grep -vc '^$')
n_in=$(printf '%s\n'  "$IN"  | grep -vc '^$')
pk_in=$(grep -c ' In ' "$TMP")
pk_out=$(grep -c ' Out ' "$TMP")
admitted=$(journalctl -b -u interfold -o cat --no-pager 2>/dev/null | sed 's/\x1b\[[0-9;]*m//g' \
  | grep -oE "Peer admitted peer_id=[A-Za-z0-9]+" | awk -F= '{print $2}' | sort -u | wc -l | tr -d ' ')

if [ -z "$OPERATOR" ]; then
  OPERATOR=$(interfold wallet get 2>/dev/null | grep -oE '0x[0-9a-fA-F]{40}' | head -1)
fi

json_list() { printf '%s\n' "$1" | grep -v '^$' | sed 's/.*/"&"/' | paste -sd, - ; }
REPORT=$(printf '{"version":1,"operator":"%s","sampledAt":"%s","seconds":%s,"peers":[%s],"inbound":[%s],"packetsIn":%s,"packetsOut":%s,"admittedSinceBoot":%s}' \
  "$OPERATOR" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$SECS" "$(json_list "$ALL")" "$(json_list "$IN")" "${pk_in:-0}" "${pk_out:-0}" "${admitted:-0}")

[ -n "$OUT" ] && printf '%s\n' "$REPORT" > "$OUT"
[ -n "$UPLOAD" ] && curl -fsS -X POST -H 'Content-Type: application/json' --data "$REPORT" "$UPLOAD" >/dev/null

if [ "$JSON" = 1 ]; then
  printf '%s\n' "$REPORT"
  exit 0
fi

echo
echo "peers exchanging traffic: ${n_all:-0}"
echo "  of which dialed IN to us: ${n_in:-0}  (proves inbound reachability)"
echo "  packets: ${pk_in} in / ${pk_out} out"
echo
echo "peer IPs:"
printf '%s\n' "$ALL" | grep -v '^$' | sed 's/^/  /'
echo
echo "admitted since boot (cumulative, not current):"
echo "  ${admitted:-0}"
[ -n "$OUT" ] && echo "report written to $OUT"
[ -n "$UPLOAD" ] && echo "report uploaded to $UPLOAD"
