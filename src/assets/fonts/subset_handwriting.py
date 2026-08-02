# -*- coding: utf-8 -*-
"""子集化两款 OFL 手写体（钟齐志莽行书 ZhiMangXing / 龙藏体 LongCang）：
覆盖 GB2312 全字符集（一级 3755 + 二级 3008）+ 全角符号 + ASCII，
输出到 public/fonts 后按 unicode-range 切成 latin / cjk-a / cjk-b 三片。

用法：python subset_handwriting.py（在 src/assets/fonts 目录下运行）
"""
import string
import sys
from pathlib import Path

from fontTools import subset
from fontTools.subset import Subsetter, Options
from fontTools.ttLib import TTFont

FONTS_DIR = Path(__file__).resolve().parents[3] / "public" / "fonts"

# GB2312 全字符集：符号区(A1-AF) + 一级汉字(B0-D7) + 二级汉字(D8-F7)
chars = set()
for hi in range(0xA1, 0xF8):
    for lo in range(0xA1, 0xFF):
        try:
            chars.add(bytes([hi, lo]).decode("gb2312"))
        except UnicodeDecodeError:
            pass

# ASCII 可打印字符
chars.update(string.printable[:95])

# 常用中文标点与符号（GB2312 符号区之外的现代用法）
chars.update("，。！？；：“”‘’（）《》、·—…【】「」～€")

text = "".join(sorted(chars))
print("字符数:", len(text))

RANGES = [
    ("latin", [(0x0000, 0x00FF), (0x2000, 0x206F), (0x3000, 0x303F), (0xFF00, 0xFFEF)]),
    ("cjk-a", [(0x4E00, 0x7FFF)]),
    ("cjk-b", [(0x8000, 0x9FFF)]),
]

SOURCES = [
    ("Xiaolai-Regular.ttf", "XiaolaiSC"),
]


def make_subset(src_path: str, stem: str) -> Path:
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.hinting = False
    opts.desubroutinize = True
    opts.layout_features = []  # 手写体无需复杂 OpenType 特性
    opts.name_IDs = [1, 2, 4]  # 仅保留字体名（许可追溯）
    opts.drop_tables += ["DSIG", "gasl", "hdmx", "kern", "LTSH", "PCLT", "VDMX", "vhea", "vmtx"]
    opts.notdef_outline = True
    opts.recalc_bounds = True

    font = subset.load_font(src_path, opts)
    sub = subset.Subsetter(opts)
    sub.populate(text=text)
    sub.subset(font)
    out = FONTS_DIR / f"{stem}-subset.woff2"
    font.save(out)
    print(f"saved {out.name}: {out.stat().st_size // 1024} KB")
    return out


def split_one(src: Path) -> None:
    stem = src.stem  # e.g. ZhiMangXing-subset
    for suffix, spans in RANGES:
        out = FONTS_DIR / f"{stem}-{suffix}.woff2"
        font = TTFont(src)
        opts = Options()
        opts.flavor = "woff2"
        opts.layout_features = ["*"]
        opts.name_IDs = ["*"]
        subsetter = Subsetter(options=opts)
        unicodes = set()
        for lo, hi in spans:
            unicodes.update(range(lo, hi + 1))
        subsetter.populate(unicodes=unicodes)
        subsetter.subset(font)
        font.save(out)
        print(f"{out.name}: {out.stat().st_size // 1024} KB")


def main() -> None:
    FONTS_DIR.mkdir(parents=True, exist_ok=True)
    for src_name, stem in SOURCES:
        if not Path(src_name).exists():
            print(f"!! missing {src_name}")
            sys.exit(1)
        subset_path = make_subset(src_name, stem)
        split_one(subset_path)
        subset_path.unlink()  # 整包不部署，只保留三片
    print("done")


if __name__ == "__main__":
    main()
