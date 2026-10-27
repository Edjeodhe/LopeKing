#!/bin/sh
# 캐릭터 그림 일괄 뽑기 (Codex CLI): 통 이미지 → (통 이미지를 참고로) 부위 시트·무기·사망 컷. 있는 그림은 건너뜀, 실패하면 기다렸다 다시.
# 사용: sh tools/gen_char.sh <id> [id ...]   진행: out/gen_char.log
# 다 뽑으면: python tools/slice_char.py art/<id>
cd "$(dirname "$0")/.."
mkdir -p out
log=out/gen_char.log
python tools/char_prompts.py "$@" > /dev/null
one() {   # one <id> <이름> <참고그림...>
  d=art/$1; n=$2; shift 2
  [ -f $d/prompt_$n.txt ] || return 0
  for try in 1 2 3 4; do
    [ -f $d/$n.png ] && break
    args=""
    for r in "$@"; do args="$args -i $r"; done
    (cd $d && codex exec --skip-git-repo-check -s workspace-write $args - < prompt_$n.txt > log_$n.txt 2>&1)
    [ -f $d/$n.png ] && break
    sleep $((try * 90))
  done
  echo "$(date +%H:%M) $d/$n $([ -f $d/$n.png ] && echo ok || echo FAIL)" >> $log
}
for id in "$@"; do
  one $id full_side
  [ -f art/$id/full_side.png ] || { echo "$(date +%H:%M) $id 통 이미지 실패 - 건너뜀" >> $log; continue; }
  one $id parts_side full_side.png
  one $id weapon full_side.png
  # 사망 컷은 SD 배율로 조립한 참고 그림(리그 편집기·sd_ref.png)이 있으면 그걸로 — 통 이미지보다 비율이 정확
  if [ -f art/$id/sd_ref.png ]; then one $id death sd_ref.png; else one $id death full_side.png; fi
done
echo "$(date +%H:%M) 끝 $*" >> $log
