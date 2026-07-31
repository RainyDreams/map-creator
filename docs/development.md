# 开发文档

面向想读懂、构建或二次开发本项目的人。本文档描述架构、目录、数据流、工程化约定与部署流程。

> 注意：本项目源码公开仅供学习参考，暂未指定开源许可证；二次开发或商用请先联系作者。

## 目录

1. [架构总览](#一架构总览)
2. [目录结构](#二目录结构)
3. [数据模型与持久化](#三数据模型与持久化)
4. [渲染与导出](#四渲染与导出)
5. [工程化约定](#五工程化约定)
6. [后端接口](#六后端接口)
7. [构建与部署](#七构建与部署)
8. [调试与测试](#八调试与测试)

---

## 一、架构总览

```
┌─────────────────────────────────────────────┐
│  浏览器（纯前端 SPA）                          │
│  React 19 + TS + Vite · Tailwind · shadcn/ui │
│  数据：localStorage（本地优先）                 │
└──────────────┬──────────────────────────────┘
               │ 少量接口（省市/院校/反馈/日志/分享）
┌──────────────▼──────────────────────────────┐
│  Cloudflare Pages Functions（无独立服务器）     │
│  存储：D1（反馈/分享）· KV（限流计数）           │
└─────────────────────────────────────────────┘
```

设计取舍：名单数据**不上云**，因此没有账号系统、没有服务端画布存储；服务端只承担「公共数据查询」与「反馈/日志」两类轻职责。这决定了大部分功能（录入、排版、导出）在无网环境下也能工作。

## 二、目录结构

```
app/
├── src/
│   ├── pages/            # 路由页面：Creator（录入+地图同页）、关于、协议、反馈等
│   ├── components/
│   │   ├── entry/        # 录入侧：表格、分组模态框、各设置面板、颜色选择器
│   │   ├── map/          # 地图侧：ChinaMap（SVG）、LabelColumns（标注列）、geo/labels
│   │   ├── layout/       # 站点布局（页脚等）
│   │   └── ui/           # shadcn/ui 组件
│   ├── store/            # MapDataContext：全局数据 + localStorage 持久化 + normalize 迁移
│   ├── utils/            # 导出、Excel、字体、城市/院校数据、会话日志等
│   └── types/            # MapData 等核心类型（EMPTY_MAP_DATA 含全部默认值）
├── functions/            # Cloudflare Pages Functions（/api/*）
│   ├── api/              # provinces / cities / universities / feedback / logs / share ...
│   └── api/_data/        # 服务端大数据 JSON（省市、院校），不打包进前端
├── public/               # 静态资源：地图 GeoJSON、字体子集、图片、_headers
├── scripts/              # 构建辅助：debug 页合并、镜像包、字体子集化、城市抓取
└── docs/                 # 项目文档（本文件、使用教程、插图）
```

页面路由只有 `/`（Creator）、`/debug`、`/about`、`/agreement`、`/privacy`、`/feedback` 等少数几个——**地图不是独立路由**，桌面端与录入同页、移动端是 Tab 切换。

## 三、数据模型与持久化

- 单一事实来源：`src/types/index.ts` 的 `MapData`（名单、主题、排版、装饰、卡片位置等全部字段）+ `EMPTY_MAP_DATA` 默认值；
- 持久化：localStorage 键 `cenfan-map-store-v2`，结构为 `{ canvases: [{id, name, data, badge, updatedAt}], activeId, customFonts }`（多画布）；
- **normalize 迁移**：读取时逐字段补齐/校验，新增字段用默认值兜底——任何版本升级都不能让旧数据打不开；
- 所有编辑实时写入 store 并同步 localStorage，地图页与录入页共享同一 store。

## 四、渲染与导出

- 地图为自绘 SVG：GeoJSON 异步加载（`public/data/china.json`），省份填色、城市定位点、引线、标注列全部矢量计算；桌面/移动两个 ChinaMap 实例并存（CSS 隐藏其一），注意 id 需按实例唯一；
- 导出 PNG（`src/utils/exportImage.ts`，独立 chunk 动态加载）：离屏克隆画布 → 等字体就绪 → SVG 序列化 → Canvas 栅格化；矢量路径失败时回退 pixelRatio 位图路径；全程有阶段日志与可取消按钮；
- 校徽等图片导出前已预取为 dataURL 内联，避免导出时逐张走网络。

## 五、工程化约定

1. **按需分包**：Excel 导入导出、JSON 导入导出、图片导出、静态页面均为独立 chunk 动态加载；未加载时界面必须有骨架/加载动画；
2. **资源不入主包**：GeoJSON、字体、图片走 `public/` 异步加载——保证主 JS 哈希在大多数版本间稳定（配合版本检测：localStorage 存哈希，变了才展示「功能更新」进度条）;
3. **字体子集化**：预设字体按用到的字符区间裁剪（`scripts/subset-fonts.py`），可 CDN 并行加载；
4. **产物命名**：`assets/index<8位hex>.js`，无下划线（某些 CDN 对下划线不友好）；
5. **双产物**：`npm run build` 出正式版；`npm run build:debug` 出带模块路径标注的 `/debug` 版并合并进 dist；
6. **日志钩子**：关键操作（导出各阶段、排版决策、错误）都写会话日志，用户反馈时可选择附带——排查问题以日志为第一抓手；
7. **限流与防护**：所有写接口（反馈/日志/错误上报）带限流与长度限制，防刷防撞库。

## 六、后端接口

| 接口 | 说明 | 存储 |
| --- | --- | --- |
| `GET /api/provinces` | 省份列表 | _data JSON |
| `GET /api/cities?province=a&province=b` | 城市查询，支持多省合并一次请求 | _data JSON |
| `GET /api/universities?name=...` | 院校排名/城市补全 | _data JSON |
| `POST/GET /api/feedback` | 问题反馈（类 GitHub Issues：状态/回复/追加） | D1 |
| `POST /api/logs` | 会话日志上传（保留约一周） | D1 |
| `POST /api/error-report` | JS 错误自动上报 | D1 |
| `GET/POST /api/share` | 短链接分享（前端入口当前临时置灰） | D1 |
| `GET /api/school-badge` | 校徽代理（**当前 503 短路，临时关闭**） | — |

管理端（反馈管理/日志查看/统计分析）是**独立仓库、独立域名**的项目，不在这里。

## 七、构建与部署

```bash
npm install
npm run dev          # 开发
npm run build        # 生产构建（tsc -b && vite build）
npm run build:all    # 正式 + debug 合并（部署用）
npm run build:mirror # 额外生成镜像包（备用 CDN 分发）
npx wrangler pages deploy dist --project-name=cengfan-map --branch=main
```

- 自定义域 `map.linkbrain.top` 部署后有约 20 秒传播延迟，核对方式：比较线上 `index.html` 引用的 `assets/index<hash>.js` 与本地 dist 是否一致；
- `_headers`（`public/_headers`）配置安全响应头：禁止 iframe 嵌套、严格 MIME 等；
- 前端另有多处混淆实现的正版域名校验，非授权域名访问会提示并重定向。

## 八、调试与测试

- `/debug` 页面与正式版同代码，但 bundle 带模块路径标注（code-path），用于线上排查；
- 端到端验证使用 CDP（Chrome DevTools Protocol）脚本驱动无头 Chrome：注入种子数据 → 断言 DOM/网络/存储 → 截图目检（脚本与截图不提交到本仓库）；
- 类型检查即构建的一部分（`tsc -b`），`noUnusedLocals` 开启——提交前确保 `npm run build` 干净通过。
