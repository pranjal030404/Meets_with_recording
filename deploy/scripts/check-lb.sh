#!/usr/bin/env bash
# Post-deploy check of the load balancer. Usage: deploy/scripts/check-lb.sh [domain]
D="${1:-meet.arthvex.co.in}"
ok(){ printf '  [ok]   %s\n' "$1"; }; bad(){ printf '  [FAIL] %s\n' "$1"; FAIL=1; }
FAIL=0
for h in "$D" "node1.$D" "node2.$D"; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "https://$h/$([ "$h" = "$D" ] && echo healthz || echo healthz)") 
  [ "$code" = 200 ] && ok "https://$h/healthz" || bad "https://$h/healthz -> $code"
done
for p in 5010 5011; do
  curl -fsS "http://127.0.0.1:$p/api/health" >/dev/null && ok "local node :$p" || bad "local node :$p down"
done
redis-cli ping 2>/dev/null | grep -q PONG && ok "redis" || bad "redis not answering"
pm2 jlist 2>/dev/null | grep -o '"name":"meetclone-[a-z0-9-]*"[^}]*"status":"[a-z]*"' | sed 's/.*"name":"\([^"]*\)".*"status":"\([^"]*\)"/  pm2 \1: \2/'
exit $FAIL
