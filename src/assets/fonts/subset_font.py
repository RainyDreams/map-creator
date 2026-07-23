# -*- coding: utf-8 -*-
"""子集化 Ma Shan Zheng：ASCII + 常用标点 + 界面文字 + GB2312 一级常用字（3755 个，按拼音序即常用字集）"""
import string
from fontTools import subset

# GB2312 一级汉字区（B0A1-D7F9，3755 个最常用汉字）
chars = set()
for hi in range(0xB0, 0xD8):
    for lo in range(0xA1, 0x100):
        try:
            chars.add(bytes([hi, lo]).decode("gb2312"))
        except UnicodeDecodeError:
            pass

# ASCII 可打印字符
chars.update(string.printable[:95])

# 常用中文标点与符号
chars.update("，。！？；：""''（）《》、·—…【】「」～")

# 界面/地图实际用到的文字（确保全覆盖）
ui_text = (
    "蹭饭图相伴三年的老师们届年级班级姓名大学城市名单录入导出高清未定位省份"
    "预览随实时更新可还没有同学数据先到页添加吧以下位暂未在地图上请回补充们的或信息"
    "超清普通导出中失败重试北京大学清华复旦交通浙江南京武汉四川中山山东科技师范理工"
    "人民航空航天邮电外国语财经政法医科药科农业林业矿业地质海洋电子工业建筑美术音乐"
    "体育学院研究所香港澳门台湾省市区自治区维吾尔回族壮族特别行政区内蒙古广西壮族宁夏新疆西藏"
    "北京天津河北山西辽宁吉林黑龙江上海江苏安徽福建江西河南湖北湖南广东海南重庆贵州云南陕西甘肃青海"
    "广州深圳杭州成都西安长沙郑州苏州青岛厦门大连宁波无锡福州合肥昆明哈尔滨长春沈阳石家庄太原南昌南宁贵阳兰州海口银川西宁乌鲁木齐拉萨呼和浩特"
    "一二三四五六七八九十零物理化学生物历史地理政治语文数学英语体育班主任"
)
chars.update(ui_text)

# GB2312 二级字中的常见姓氏/人名/地名用字补充（一级字之外、名单场景高频出现）
# 覆盖：谌冼覃郗綦昝宓仝逯郇隗郦昉旻晗昱晟晔晗曦楠梓琦琪瑶瑜瑾璇璨昊喆垚淼焱犇翀彧赟劼勰燚沄湉濛熠煜烨煊琰琮琛琨瑭祎祺禛隽翎翕弋骁骞骅骐鲲麟黉鼐乜亓仉佀伋佴佺俣俟倜偲偰傥僾冮冼凇勍匚卲厍叡叱吒咥哿唅啇喾嗌噙圻垚堃堉墉奕妤姮娣婧嬿孑孛宓宕宥宸寮尢屺峤崧嵯嶷彧忻恽愫懋戢扦昊旻昉晗晟暹曌朕杞柯桡桢梓梾楦榇樾橼毖沂沣泮洮洺浒浛涞淼渼湜溦滢潢澹炤烨焓煊熠燚犇犍猗猱珅珣琤琰琮琛琨瑭璨璩甦畯疍皛瞾矶祎祚祺禛秾穰竦笒筠筱籼粲綦缃羿翊翀翕翎翯翟聃肸胤臧艽苁苒苕荦荟荨荩荽莛菡萁菖萸葭蒄蒯蓁蓦蔚蕲薤蘅虢蚺蜩蝻衎衿袆裎裴褰觐訚詟诤谡谞赟赪跞轲轸辂郅郗郇郦郸鄯酆醍鋆锟锴镒闳闱阇阮陟隗雒霈靓靳韬顼颀颉颢饫饸馝骁骅骐骞骧髟魉鲲鲛鲡鱽鳏鹍鹮鹭麴黉鼐龑
chars.update(
    "谌冼覃郗綦昝宓仝逯郇隗郦昊喆垚淼焱犇翀彧赟燚楠梓琦琪瑶瑜瑾璇璨"
    "晗昱晟晔曦旻昉祎祺禛隽翊翎翕弋骁骞骅骐鲲麟黉乜亓仉佴俣偲勍卲厍叡"
    "凇圻堃奕妤姮婧嬿孛宸屺峤崧恽愫懋戢杞桢梾楦榇樾橼沣泮洺浒浛涞渼"
    "湜溦滢潢澹炤烨焓煊熠珅珣琤琰琮琛琨瑭璩甦畯皛瞾祚秾穰筠筱綦缃羿"
    "翯翟聃胤臧苁苒苕荦荟荨荩莛菡萁菖萸葭蒯蓁蓦蔚蕲薤蘅虢衎衿袆裎裴"
    "褰觐詟诤谡谞赪跞轲轸辂郅郸鄯酆鋆锟锴镒闳闱陟雒霈靓靳韬顼颀颉颢"
    "饫饸髟魉鲛鲡鹍鹮鹭麴鼐龑"
)

text = "".join(sorted(chars))
print("字符数:", len(text))

opts = subset.Options()
opts.flavor = "woff2"
opts.hinting = False
opts.desubroutinize = True
opts.layout_features = []  # 书法字体无需复杂 OpenType 特性
opts.name_IDs = [1, 2, 4]  # 仅保留字体名（许可追溯）
opts.drop_tables += ["DSIG", "gasl", "hdmx", "kern", "LTSH", "PCLT", "VDMX", "vhea", "vmtx"]
opts.notdef_outline = True
opts.recalc_bounds = True

font = subset.load_font("MaShanZheng-Regular.ttf", opts)
sub = subset.Subsetter(opts)
sub.populate(text=text)
sub.subset(font)
font.save("MaShanZheng-subset.woff2")
print("done")
