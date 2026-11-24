# 璃海 · SimMC 国家成员站

> 海纳百川，璃光不灭

一个用于展示 Minecraft 服务器 **SimMC** 中国家「**璃海**」成员信息的静态网站：成员名单、国家职位、职务分工、各人简介。

**线上地址：<https://longyiyi1314.github.io/lihai-simmc/>**

---

## 这是什么

- 纯静态站点，由 [Astro](https://astro.build) 构建，**默认零 JavaScript**，加载快、可直接托管在 GitHub Pages。
- 全部内容来自 `data/` 下的 4 个 JSON 文件，**改数据即改站**，无需触碰任何页面代码。
- 部署方式：推送到 `main` 分支后，GitHub Actions 自动构建并发布（见 `.github/workflows/deploy.yml`）。

## 目录结构

```
data/                 ← 你只需要改这里
  site.json           国家信息：名称、格言、版本、建站时间、公告
  ranks.json          职位层级：国主 / 副国主 / 长老 / 国民 / 见习
  roles.json          职务分工：外交 / 军事 / 营造 / 后勤 / 宣传 / 招募
  members.json        成员名单：每人一条记录
src/
  lib/                数据读取、Zod 校验、跨文件校验、路径拼接
  components/         头像、职位徽章、职务标签、成员卡片等
  pages/              首页、成员列表、成员详情、职位、关于、404
  styles/global.css   全站设计系统（深蓝 + 玉青 + 琉金）
录入模板/             ← 用 Excel 收集真实数据时用这里的 CSV
准备方案.md           最初的设计方案（站点地图、数据模型、校验规则）
```

## 更新成员数据

### 方式一：直接改 JSON（熟悉的话最快）

编辑 `data/members.json`，每个成员一条：

```json
{
  "id": "hai-ling",
  "name": "海铃",
  "romanizedName": "HaiLing",
  "title": "慈海之人",
  "rank": "leader",
  "roles": ["diplomacy", "military"],
  "joinedAt": "2024-03",
  "status": "active",
  "featured": true,
  "intro": "璃海的发起人之一……"
}
```

字段说明：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | 是 | 唯一标识，同时用作网址：`/members/<id>/`，建议用拼音短横线 |
| `name` | 是 | 游戏内 ID / 显示名 |
| `romanizedName` | 否 | 英文名，用于排版点缀 |
| `title` | 否 | 称号，如「慈海之人」 |
| `rank` | 是 | 必须是 `data/ranks.json` 里定义的 `id` |
| `roles` | 否 | 数组，元素必须是 `data/roles.json` 里定义的 `id`，可多选 |
| `joinedAt` | 是 | 加入月份，格式 `YYYY-MM` |
| `status` | 是 | `active` 现役 / `reserve` 休假 / `left` 已离开 / `honorary` 荣誉 |
| `featured` | 否 | `true` 会出现在首页「海上的面孔」 |
| `intro` | 是 | 个人简介，一两句话 |
| `leftAt` | 否 | 仅 `status` 为 `left` 时需要，格式 `YYYY-MM` |

> ⚠️ 构建时会做 9 项校验：`rank`/`roles` 是否存在、`id` 是否重复、职位人数是否超出上限、日期格式是否合法等。**写错会直接构建失败并提示具体是哪个成员哪个字段**，不会静默上线错误数据。

### 方式二：用 Excel 收集再转换（人多时推荐）

`录入模板/` 里有 4 份模板：

- `01-组织信息.md` —— 国家名称、格言、建站时间等
- `02-成员名单.csv` —— 16 列，一行一个成员
- `03-职位层级.csv` —— 8 列，职位与人数上限
- `04-职务分工.csv` —— 5 列，职务说明

填好后按 `00-先看我-怎么用.md` 的说明转成 `data/` 下的 JSON（字段一一对应）。

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

首次部署前需在仓库 **Settings → Pages** 中把 Source 设为 **GitHub Actions**（本项目已配置好）。

## 说明

- 站点当前仍是**示例数据**（`data/site.json` 中 `isPlaceholder: true`），页面顶部会显示提示条。换成真实数据后请把该字段改为 `false`，提示条会自动消失。
- GitHub Pages 是公开托管，**不要**在成员简介里填写任何真实姓名、联系方式等隐私信息。
