#!/usr/bin/env bash
# 打包网页版 app，传到服务器的 /opt/ddl-killer/webapp。
# 用法（仓库根目录）：bash scripts/deploy-web.sh [ssh 主机]，默认主机是 ddl；
# 要给 ssh 加参数就设 SSH_OPTS，比如 SSH_OPTS="-F ~/.ssh/ddl-config"
set -euo pipefail
host="${1:-ddl}"
cd "$(dirname "$0")/.."

rm -rf dist
EXPO_PUBLIC_API_URL=https://ninebug.xyz npx expo export -p web --output-dir dist

# 先传到 webapp.new，传完再整个换上去，换的那一下才生效；上一版留在 webapp.old 方便退回
tar -C dist -czf - . | ssh ${SSH_OPTS:-} "$host" 'set -e
d=/opt/ddl-killer/webapp
rm -rf "$d.new" && mkdir -p "$d.new"
tar -xzf - -C "$d.new"
chown -R ddl:ddl "$d.new"
rm -rf "$d.old"
if [ -d "$d" ]; then mv "$d" "$d.old"; fi
mv "$d.new" "$d"
echo "网页版已更新：$(ls "$d" | tr "\n" " ")"'
