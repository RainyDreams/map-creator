# -*- coding: utf-8 -*-
"""下载开源字体并子集化为 woff2（ASCII + GB2312 一级常用字 + 界面文字）。"""
import string
import subprocess
import sys
from pathlib import Path

from fontTools import subset

FONTS = [
    ("NotoSansSC", "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf", "NotoSansSC-subset.woff2"),
    ("NotoSerifSC", "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notoserifsc/NotoSerifSC%5Bwght%5D.ttf", "NotoSerifSC-subset.woff2"),
    ("ZCOOLXiaoWei", "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/zcoolxiaowei/ZCOOLXiaoWei-Regular.ttf", "ZCOOLXiaoWei-subset.woff2"),
]

OUT_DIR = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
TMP = OUT_DIR / "_tmp_fonts"
TMP.mkdir(parents=True, exist_ok=True)


def charset() -> str:
    chars = set()
    for hi in range(0xB0, 0xD8):
        for lo in range(0xA1, 0x100):
            try:
                chars.add(bytes([hi, lo]).decode("gb2312"))
            except UnicodeDecodeError:
                pass
    chars.update(string.printable[:95])
    chars.update("，。！？；：\"\"''（）《》、·—…【】「」～")
    chars.update(
        "蹭饭图相伴三年的老师们届年级班级姓名大学城市名单录入导出高清未定位省份"
        "预览随实时更新可还没有同学数据先到页添加吧以下位暂未在地图上请回补充们的或信息"
        "超清普通导出中失败重试北京大学清华复旦交通浙江南京武汉四川中山山东科技师范理工"
        "人民航空航天邮电外国语财经政法医科药科农业林业矿业地质海洋电子工业建筑美术音乐"
        "体育学院研究所香港澳门台湾省市区自治区维吾尔回族壮族特别行政区内蒙古广西壮族宁夏新疆西藏"
        "北京天津河北山西辽宁吉林黑龙江上海江苏安徽福建江西河南湖北湖南广东海南重庆贵州云南陕西甘肃青海"
        "一二三四五六七八九十零物理化学生物历史地理政治语文数学英语体育班主任"
    )
    return "".join(sorted(chars))


def make_subset(src: Path, dst: Path, text: str) -> None:
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.hinting = False
    opts.desubroutinize = True
    opts.layout_features = []
    opts.name_IDs = [1, 2, 4]
    opts.drop_tables += ["DSIG", "gasl", "hdmx", "kern", "LTSH", "PCLT", "VDMX", "vhea", "vmtx"]
    opts.notdef_outline = True
    opts.recalc_bounds = True
    font = subset.load_font(str(src), opts)
    sub = subset.Subsetter(opts)
    sub.populate(text=text)
    sub.subset(font)
    font.save(str(dst))


def main() -> None:
    text = charset()
    print("字符数:", len(text))
    for name, url, out_name in FONTS:
        raw = TMP / f"{name}.ttf"
        if not raw.exists():
            print(f"下载 {name} ...")
            subprocess.run(["curl", "-sL", "--max-time", "300", url, "-o", str(raw)], check=True)
        dst = OUT_DIR / out_name
        make_subset(raw, dst, text)
        size_kb = dst.stat().st_size // 1024
        print(f"{out_name}: {size_kb} KB")


if __name__ == "__main__":
    main()
