#!/bin/sh
# 로그라이크 물건 그림 뽑기 (Codex CLI): art/props/prompt_<이름>.txt → <이름>.png. 있는 그림은 건너뜀, 실패하면 기다렸다 다시.
# 사용: sh tools/gen_props.sh [이름 ...]  (기본: chests masks items gate, 한꺼번에)
# 다 뽑으면: python tools/pixelize_props.py → art/props/*_px.png (게임이 쓰는 1배 도트)
cd "$(dirname "$0")/../art/props"
one() {   # one <이름> <참고그림...>
  n=$1; shift
  for try in 1 2 3; do
    [ -f $n.png ] && break
    args=""
    for r in "$@"; do args="$args -i $r"; done
    codex exec --skip-git-repo-check -s workspace-write $args - < prompt_$n.txt > log_$n.txt 2>&1
    [ -f $n.png ] && break
    sleep $((try * 90))
  done
  echo "$(date +%H:%M) $n $([ -f $n.png ] && echo ok || echo FAIL)"
}
[ $# -gt 0 ] || set -- chests masks items gate
for n in "$@"; do
  case $n in masks*) one $n ref_masks.png & ;; *) one $n & ;; esac
done
wait
