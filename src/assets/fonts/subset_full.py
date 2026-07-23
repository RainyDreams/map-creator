# -*- coding: utf-8 -*-
"""重新子集化画布字体：覆盖 GB2312 全部汉字（一级 3755 + 二级 3008）+ 全角符号 + ASCII。

背景：旧版只覆盖 GB2312 一级常用字，生僻姓氏/地名用字（谌、冼、覃、翀、彧等）
不在子集内，依赖系统字体兜底；在兜底失败的设备上显示为缺字（豆腐块）。

- NotoSansSC-full.ttf 为可变字体（wght 100-900），先实例化到 400 再子集化
- MaShanZheng-Regular.ttf 为静态字体，直接子集化
输出文件与旧版同名，CSS 无需改动。
"""
import string
from fontTools import subset
from fontTools.varLib.instancer import instantiateVariableFont

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

# 界面/地图实际用到的文字（双保险）
ui_text = (
    "蹭饭图相伴三年的老师们届年级班级姓名大学城市名单录入导出高清未定位省份"
    "预览随实时更新可还没有同学数据先到页添加吧以下位暂未在地图上请回补充们的或信息"
    "超清普通导出中失败重试取消正在"
    "人民航空航天邮电外国语财经政法医科药科农业林业矿业地质海洋电子工业建筑美术音乐"
    "体育学院研究所香港澳门台湾省市区自治区维吾尔回族壮族特别行政区内蒙古广西壮族宁夏新疆西藏"
    "一二三四五六七八九十零物理化学生物历史地理政治语文数学英语体育班主任"
)
chars.update(ui_text)

# GB2312 之外的常见姓氏/人名用字补充（NotoSansSC 完整版覆盖这些字形）
chars.update(
    "谌冼覃郗綦昝宓仝逯郇隗郦昊喆垚淼焱犇翀彧赟燚楠梓琦琪瑶瑜瑾璇璨"
    "晗昱晟晔曦旻昉祎祺禛隽翊翎翕弋骁骞骅骐鲲麟黉乜亓仉佴俣偲勍卲厍叡"
    "凇圻堃奕妤姮婧嬿孛宸屺峤崧恽愫懋戢杞桢梾楦榇樾橼沣泮洺浒浛涞渼"
    "湜溦滢潢澹炤烨焓煊熠珅珣琤琰琮琛琨瑭璩甦畯皛瞾祚秾穰筠筱缃羿"
    "翯翟聃胤臧苁苒苕荦荟荨荩莛菡萁菖萸葭蒯蓁蓦蔚蕲薤蘅虢衎衿袆裎裴"
    "褰觐詟诤谡谞赪跞轲轸辂郅郸鄯酆鋆锟锴镒闳闱陟雒霈靓靳韬顼颀颉颢"
    "饫饸髟魉鲛鲡鹍鹮鹭麴鼐龑"
)

text = "".join(sorted(chars))
print("字符数:", len(text))


def make_subset(src_path: str, out_path: str, wght: int | None) -> None:
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.hinting = False
    opts.desubroutinize = True
    opts.layout_features = []
    opts.name_IDs = [1, 2, 4]  # 仅保留字体名（许可追溯）
    opts.drop_tables += ["DSIG", "gasl", "hdmx", "kern", "LTSH", "PCLT", "VDMX", "vhea", "vmtx"]
    opts.notdef_outline = True
    opts.recalc_bounds = True

    font = subset.load_font(src_path, opts)
    if wght is not None and "fvar" in font:
        instantiateVariableFont(font, {"wght": wght}, inplace=True)
    sub = subset.Subsetter(opts)
    sub.populate(text=text)
    sub.subset(font)
    font.save(out_path)
    print("saved", out_path)


make_subset("NotoSansSC-full.ttf", "NotoSansSC-subset.woff2", 400)
# MaShanZheng 用 subset_font.py 单独生成（一级字 + 姓氏补充，控制体积）
print("done")
