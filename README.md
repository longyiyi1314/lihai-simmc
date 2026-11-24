# 璃海苏维埃公社联盟 · SimMC 国家成员站

> 追求真理，创造奇迹

展示 Minecraft 服务器 **SimMC** 中国家「**璃海苏维埃公社联盟**」（Riherie Soviete Commune Unien）的公开档案：国家概况、成员名录、职级与职务、疆域、旗帜与编年。

**线上地址：<https://longyiyi1314.github.io/lihai-simmc/>**

---

## 这是什么

- 纯静态站点，由 [Astro](https://astro.build) 构建，**默认零 JavaScript**，加载快、可直接托管在 GitHub Pages。
- 全部内容来自 `data/` 下的 5 个 JSON 文件，**改数据即改站**，无需触碰页面代码。
- 推送到 `main` 分支后由 GitHub Actions 自动构建并发布（见 `.github/workflows/deploy.yml`）。

## 页面

| 路径 | 内容 |
| --- | --- |
| `/` | 首页：国家形象、统计、名录摘要、疆域带、职级与职务概览、公告 |
| `/members/` | 成员名录：按职级分组，含职级说明与筛选锚点 |
| `/members/<id>/` | 成员详情：头像、游戏 ID、职级、职务、简介、上下一位翻页 |
| `/ranks/` | 职级阶梯（8 级）与职务分工（7 类），含职责、晋升、在任名单 |
| `/territory/` | 疆域：24 处已下发领地按层级分组，另标注 8 处待下发 |
| `/about/` | 联盟档案：来历、地理四区、制度、经济、Yun 历编年、旗帜与节日、加入方式 |
| `/404.html` | 未找到页面 |

## 目录结构

```
data/                 ← 你只需要改这里
  site.json           国家信息：全称、口号、建站时间、首府、政体、节庆、联系方式、公告
  ranks.json          职级层级：8 级（含 track 序列与 grade 级别）
  roles.json          职务分工：7 类
  members.json        成员名录：每人一条记录
  territories.json    疆域：24 处领地 + 待下发数量
src/
  lib/                数据读取、Zod 校验、跨文件校验、路径拼接、主题色工具
  components/         头像、职级徽章、职务标签、成员卡片、页头页脚等
  pages/              首页、成员列表、成员详情、职级、疆域、关于、404
  styles/global.css   全站设计系统（酒红夜色 + 旗红 / 星金 / 旗蓝，取自国旗配色）
public/
  flag.png            国旗（1890×1417）
  favicon.svg         站点图标
录入模板/             ← 现有数据的 Excel 镜像（组织信息 / 成员 / 职级 / 职务 / 疆域）
准备方案.md           最初的设计方案（站点地图、数据模型、校验规则）
```

## 更新数据

### 成员（`data/members.json`）

每个成员一条记录：

```json
{
  "id": "qiyushi",
  "gameId": "Qiyushi",
  "displayName": "祁钰师",
  "title": "书记",
  "rankId": "chief",
  "roleIds": ["foreign", "secretariat"],
  "status": "active",
  "joinedAt": "",
  "leftAt": null,
  "avatar": "",
  "intro": "……",
  "tags": ["统筹", "外交", "建制"],
  "contacts": {},
  "featured": true,
  "order": 10,
  "updatedAt": "2026-11-24"
}
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | 是 | 唯一标识，同时是网址 `/members/<id>/`，建议拼音或游戏 ID 小写 |
| `gameId` | 是 | 游戏内 ID，必须与游戏内一致 |
| `displayName` | 是 | 站点显示名（昵称或中文名） |
| `title` | 否 | 称号/职务短名，如「书记」；与职级名相同时不必重复填 |
| `rankId` | 是 | 必须是 `data/ranks.json` 里的 `id` |
| `roleIds` | 否 | 数组，元素必须是 `data/roles.json` 里的 `id`，可多选 |
| `status` | 是 | `active` 在任 / `reserve` 休假 / `honorary` 荣誉 / `left` 已离会 |
| `joinedAt` | 否 | 加入月份 `YYYY-MM`；**查不到就留空**，页面显示「未记录」而不是编造 |
| `leftAt` | 否 | 仅 `status` 为 `left` 时必填 |
| `avatar` | 否 | 头像路径（放 `public/` 下）；留空则用姓名首字生成占位头像 |
| `intro` | 否 | 个人简介。**留空会显示「简介尚未录入」占位文案**，不编造经历 |
| `tags` | 否 | 擅长标签，最多 5 个 |
| `contacts` | 否 | `bilibili` / `discord` / `qq`，可留空 |
| `featured` | 否 | `true` 出现在首页「名录上的人」（建议 6 人） |
| `order` | 否 | 同职级内的排序，小的在前 |

### 职级（`data/ranks.json`）与职务（`data/roles.json`）

职级 8 级，`track` 分三条线：`party`（党务行政，6 级）、`soviet`（苏维埃代表）、`army`（武装力量）。
每级含 `grade`（行政级别，如「部级」）、`summary`、`duties[]`、`promotion`、`limit`（人数上限，`null` 为不限）。

职务 7 类：财政 / 秘书处 / 文宣 / 外交 / 劳动 / 军事 / 地区行政，`leadMemberId` 指向牵头人。

### 疆域（`data/territories.json`）

```json
{
  "pendingCount": 8,
  "territories": [
    { "id": "linhai-capital", "name": "凛海城中央公社", "tier": "capital", "note": "首府，几乎涵盖整个凛冬半岛" }
  ]
}
```

`tier` 取 `capital` / `metro` / `city` / `territory` / `province` / `town` / `village` / `settlement`。

### 构建期校验

构建时会做 12 项跨文件校验：`rankId`/`roleIds` 外键、`id` 唯一、职级人数上限、日期格式、`status` 与 `leftAt` 一致、领地层级合法、`territoryTotal = 已下发 + 待下发`、`memberTotal ≥ 名录人数` 等。**写错会直接构建失败并指出具体是哪个文件哪一条**，不会静默上线错误数据。

### Excel 收集

`录入模板/` 里有 6 份表格，**都是现有数据的镜像**，改完发回即可（CSV 为 UTF-8 with BOM，Excel 直接双击不乱码）：

| 文件 | 内容 | 行数 |
|---|---|---|
| `00-先看我-怎么用.md` | 四条填写规则 + 还缺哪些资料 | — |
| `01-组织信息.md` | 全称、成立时间、政体、节日、联系方式 | — |
| `02-成员名单.csv` | 成员主表（16 列，示例 2 行） | 2 |
| `03-职位层级.csv` | 8 级职级（含 track / grade / 人数上限） | 8 |
| `04-职务分工.csv` | 7 类职务 | 7 |
| `05-疆域.csv` | 24 处已下发领地 | 24 |
| `06-完整成员名录.csv` | 全部 24 名成员的完整表格 | 24 |

改完按 `00-先看我-怎么用.md` 的规则同步到 `data/` 下的 JSON，或直接把表发我。

## 本地开发

需要 Node.js 22 或更高版本。

```bash
npm install     # 首次运行，安装依赖
npm run dev     # 启动开发服务器
```

打开 <http://localhost:4321/lihai-simmc/> 预览，改文件会自动刷新。

```bash
npm run build   # 构建到 dist/，同时执行全部数据校验
npm run preview # 预览构建结果
```

## 部署

1. 修改 `data/` 下的 JSON；
2. 提交并推送到 `main` 分支；
3. GitHub Actions 自动构建并发布，约 1 分钟后线上生效。

仓库 **Settings → Pages** 的 Source 需为 **GitHub Actions**（本项目已配置好）。

## 说明

- 成员名录只收录**凛海城中央公社前 24 位成员**，全社在册 277 人；页面已注明这一范围，不做夸大。
- 简介、加入时间等无法考证的信息一律留白，不用示例文字填充。
- GitHub Pages 是公开托管，**不要**在简介或联系方式里填写真实姓名、住址、手机号等隐私信息。
