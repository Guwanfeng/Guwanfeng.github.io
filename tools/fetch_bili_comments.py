#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""抓取 B站视频信息 + 热门/最新评论，写入 data/bili-comments.json。

为什么要在服务器端跑：浏览器直接请求 B站接口会被跨域（CORS）拦掉，
GitHub Pages 又只能放静态文件。所以由 GitHub Action 定时抓取，把结果提交进仓库，
页面再读同源的 JSON。

本地试跑：
    python tools/fetch_bili_comments.py
    BILI_BVID=BV1xx411c7mD python tools/fetch_bili_comments.py

配置（仓库根目录 bili.config.json）：
    { "bvid": "BV1xx411c7mD", "hot": 8, "latest": 8 }

关于条数：B站对未登录请求做了硬限制，每种排序只返回 3 条（cursor 直接 is_end）。
想让页面显示更多，就把自己浏览器的 Cookie 里的 SESSDATA 填到环境变量 / 仓库 Secret
BILI_SESSDATA 里，脚本会自动带上并翻页。

排序：
    热门 = /x/v2/reply/wbi/main?mode=3（需要 WBI 签名）
    最新 = /x/v2/reply/wbi/main?mode=2
    签名或接口失败时退回老的 /x/v2/reply?sort=1 / sort=0。
"""

import hashlib
import json
import os
import random
import sys
import time
import urllib.parse
import uuid
from datetime import datetime, timedelta, timezone
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(ROOT, "bili.config.json")
OUT_PATH = os.path.join(ROOT, "data", "bili-comments.json")

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

# WBI 签名用的固定混淆表
MIXIN_TAB = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
    33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
    61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62,
    11, 36, 20, 34, 44, 52,
]

COOKIE = ""


def new_buvid() -> str:
    return str(uuid.uuid4()).upper() + str(random.randint(10000, 99999)) + "infoc"


def request_json(url: str, cookie: str, retries: int = 3) -> dict:
    last_err = None
    for i in range(retries):
        headers = {
            "User-Agent": UA,
            "Referer": "https://www.bilibili.com/",
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "zh-CN,zh;q=0.9",
            "Cookie": cookie,
        }
        try:
            with urlopen(Request(url, headers=headers), timeout=25) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except (URLError, HTTPError, ValueError) as exc:
            last_err = exc
            print("  请求失败（第 {} 次）：{}".format(i + 1, exc), file=sys.stderr)
            time.sleep(3 + i * 4)
    raise RuntimeError("请求失败：{}（{}）".format(url, last_err))


def build_cookie() -> str:
    """优先用仓库 Secret 里的 SESSDATA；没有就用匿名设备指纹（只能拿 3 条）。"""
    sessdata = (os.environ.get("BILI_SESSDATA") or "").strip()
    parts = []
    try:
        spi = request_json("https://api.bilibili.com/x/frontend/finger/spi",
                           "buvid3=" + new_buvid())
        data = spi.get("data") or {}
        if data.get("b_3"):
            parts.append("buvid3=" + data["b_3"])
        if data.get("b_4"):
            parts.append("buvid4=" + data["b_4"])
    except Exception:
        parts.append("buvid3=" + new_buvid())
    parts.append("b_nut=" + str(int(time.time())))
    if sessdata:
        parts.append("SESSDATA=" + sessdata)
        print("  使用登录态抓取（条数不受 3 条限制）")
    else:
        print("  匿名抓取（B站限制每种排序最多 3 条）")
    return "; ".join(parts)


def wbi_mixin_key(cookie: str):
    nav = request_json("https://api.bilibili.com/x/web-interface/nav", cookie)
    img = (nav.get("data") or {}).get("wbi_img") or {}
    if not img.get("img_url") or not img.get("sub_url"):
        raise RuntimeError("取不到 WBI 密钥")
    raw = img["img_url"].rsplit("/", 1)[-1].split(".")[0] + img["sub_url"].rsplit("/", 1)[-1].split(".")[0]
    return "".join(raw[i] for i in MIXIN_TAB if i < len(raw))[:32]


def sign(params: dict, mixin: str) -> str:
    params = dict(params)
    params["wts"] = int(time.time())
    query = "&".join(
        "{}={}".format(k, urllib.parse.quote(str(params[k]), safe=""))
        for k in sorted(params)
    )
    return query + "&w_rid=" + hashlib.md5((query + mixin).encode()).hexdigest()


def norm_reply(r: dict) -> dict:
    member = r.get("member") or {}
    content = r.get("content") or {}
    return {
        "user": member.get("uname") or "",
        "avatar": (member.get("avatar") or "").replace("http://", "https://"),
        "content": content.get("message") or "",
        "ctime": r.get("ctime") or 0,
        "like": r.get("like") or 0,
        "rcount": r.get("rcount") or 0,
    }


def fetch_by_wbi(aid: int, mode: int, want: int, cookie: str, mixin: str):
    out, offset, pages = [], "", 0
    while len(out) < want and pages < 6:
        params = {
            "oid": aid,
            "type": 1,
            "mode": mode,
            "pagination_str": json.dumps({"offset": offset}, separators=(",", ":")),
            "plat": 1,
            "web_location": 1315875,
        }
        data = request_json("https://api.bilibili.com/x/v2/reply/wbi/main?" + sign(params, mixin), cookie)
        if data.get("code") != 0:
            raise RuntimeError("wbi/main code={} {}".format(data.get("code"), data.get("message")))
        body = data.get("data") or {}
        replies = body.get("replies") or []
        out.extend(norm_reply(r) for r in replies)
        cursor = body.get("cursor") or {}
        offset = ((cursor.get("pagination_reply") or {}).get("next_offset")) or ""
        pages += 1
        if not offset or cursor.get("is_end") or not replies:
            break
    return out[:want]


def fetch_by_legacy(aid: int, sort: int, want: int, cookie: str):
    url = ("https://api.bilibili.com/x/v2/reply?type=1&oid={}&sort={}&ps={}&pn=1"
           .format(aid, sort, want))
    data = request_json(url, cookie)
    if data.get("code") != 0:
        raise RuntimeError("reply code={} {}".format(data.get("code"), data.get("message")))
    return [norm_reply(r) for r in (data.get("data") or {}).get("replies") or []]


def load_config() -> dict:
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, encoding="utf-8") as f:
                return json.load(f)
        except Exception as exc:
            print("bili.config.json 解析失败：{}".format(exc), file=sys.stderr)
    return {}


def fail(msg: str) -> int:
    """失败时不动已有 JSON，页面继续显示上一次的快照。"""
    print("同步失败：" + msg, file=sys.stderr)
    return 1


def main() -> int:
    global COOKIE
    cfg = load_config()
    bvid = (os.environ.get("BILI_BVID") or cfg.get("bvid") or "").strip()
    hot_n = int(cfg.get("hot") or 8)
    latest_n = int(cfg.get("latest") or 8)

    if not bvid:
        return fail("没有配置 BV 号（在 bili.config.json 里填 bvid）")

    print("视频：" + bvid)
    COOKIE = build_cookie()

    view = request_json("https://api.bilibili.com/x/web-interface/view?bvid=" + bvid, COOKIE)
    if view.get("code") != 0:
        return fail("取视频信息失败，code={} {}".format(view.get("code"), view.get("message")))

    d = view["data"]
    aid = d["aid"]
    stat = d.get("stat") or {}
    video = {
        "bvid": d.get("bvid") or bvid,
        "aid": aid,
        "title": d.get("title") or "",
        "owner": ((d.get("owner") or {}).get("name")) or "",
        "cover": (d.get("pic") or "").replace("http://", "https://"),
        "url": "https://www.bilibili.com/video/" + (d.get("bvid") or bvid),
        "view": stat.get("view") or 0,
        "danmaku": stat.get("danmaku") or 0,
        "pubdate": d.get("pubdate") or 0,
    }
    print("  {}｜UP 主 {}".format(video["title"], video["owner"]))

    note = ""
    hot, latest = [], []
    try:
        mixin = wbi_mixin_key(COOKIE)
        hot = fetch_by_wbi(aid, 3, hot_n, COOKIE, mixin)
        latest = fetch_by_wbi(aid, 2, latest_n, COOKIE, mixin)
    except Exception as exc:
        print("  WBI 接口不可用（{}），退回老接口".format(exc), file=sys.stderr)

    if not hot:
        try:
            hot = fetch_by_legacy(aid, 1, hot_n, COOKIE)   # 按点赞
        except Exception as exc:
            print("  老接口失败：{}".format(exc), file=sys.stderr)
    if not latest:
        try:
            latest = fetch_by_legacy(aid, 0, latest_n, COOKIE)  # 按时间
        except Exception as exc:
            print("  老接口失败：{}".format(exc), file=sys.stderr)

    total_reply = stat.get("reply") or 0
    if not hot and not latest:
        if total_reply > 0:
            # 视频有评论却一条都没抓到 → 大概率是风控，保留上一次快照
            return fail("视频有 {} 条评论但一条都没取到（可能被风控）".format(total_reply))
        # 视频本来就还没人评论 → 不算失败，照样写快照（至少把视频信息落下去）
        print("  视频还没有评论（reply=0），写入空的评论列表")
        note = "视频暂无评论，有人评论后下次同步会自动出现"

    if not note and not os.environ.get("BILI_SESSDATA") and max(len(hot), len(latest)) <= 3:
        note = "未登录抓取，B站只放行每种排序 3 条"

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    payload = {
        "updated": datetime.now(timezone(timedelta(hours=8))).isoformat(timespec="seconds"),
        "note": note,
        "video": video,
        "hot": hot,
        "latest": latest,
    }
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print("完成：热门 {} 条 / 最新 {} 条 → {}".format(
        len(hot), len(latest), os.path.relpath(OUT_PATH, ROOT)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
