"""
把已子集化的 woff2 按 unicode-range 切成 3 片，实现「浏览器只下载用到的字符区间」：
- latin：ASCII + 拉丁扩展 + 常用标点/全角符号（几乎必用）
- cjk-a：U+4E00-7FFF（最常用汉字区）
- cjk-b：U+8000-9FFF（次常用汉字区，含多数生僻姓氏）

配合 CSS @font-face 的 unicode-range 声明：页面没用到 cjk-b 区间的字符时，
浏览器不会发起该文件请求。AlimamaShuHeiTi 仅 8.6KB 不切。

输入/输出都在 public/fonts/（稳定 URL）。用法：python split_ranges.py
"""
from fontTools.subset import Subsetter, Options
from fontTools.ttLib import TTFont
from pathlib import Path

FONTS_DIR = Path(__file__).resolve().parents[3] / "public" / "fonts"

RANGES = [
    ("latin", [(0x0000, 0x00FF), (0x2000, 0x206F), (0x3000, 0x303F), (0xFF00, 0xFFEF)]),
    ("cjk-a", [(0x4E00, 0x7FFF)]),
    ("cjk-b", [(0x8000, 0x9FFF)]),
]

SOURCES = [
    "MaShanZheng-subset.woff2",
    "NotoSansSC-subset.woff2",
    "ZCOOLXiaoWei-subset.woff2",
    "ZCOOLQingKeHuangYou-subset.woff2",
]


def range_set(spans: list[tuple[int, int]]) -> set[int]:
    out: set[int] = set()
    for lo, hi in spans:
        out.update(range(lo, hi + 1))
    return out


def split_one(src: Path) -> None:
    stem = src.stem  # e.g. MaShanZheng-subset
    for suffix, spans in RANGES:
        out = FONTS_DIR / f"{stem}-{suffix}.woff2"
        font = TTFont(src)
        opts = Options()
        opts.flavor = "woff2"
        opts.layout_features = ["*"]
        opts.name_IDs = ["*"]
        subsetter = Subsetter(options=opts)
        subsetter.populate(unicodes=range_set(spans))
        subsetter.subset(font)
        font.save(out)
        print(f"{out.name}: {out.stat().st_size // 1024} KB")


def main() -> None:
    for name in SOURCES:
        src = FONTS_DIR / name
        if not src.exists():
            print(f"!! missing {src}")
            continue
        split_one(src)


if __name__ == "__main__":
    main()
