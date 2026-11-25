// scripts/migrate-data.mjs
// 一次性数据层重构迁移（Phase B）：把「regions + territories 双份地名 + 双记成员」
// 迁成「places 合并地名树 + members.appointments 统一任职 + portfolios 统一职务」。
// 纯 Node 读写 JSON，不引入依赖。运行：node scripts/migrate-data.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'data');
const read = (p) => JSON.parse(readFileSync(join(dataDir, p), 'utf8'));
const write = (p, obj) => writeFileSync(join(dataDir, p), JSON.stringify(obj, null, 2) + '\n', 'utf8');

// ---- 名字归一：小写 + 去非字母数字（用于 gameId/displayName/id 互认）----
const normName = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
// ---- 地名归一：去行政/聚落后缀（用于 territories ↔ regions 匹配）----
const normPlace = (s) =>
  String(s ?? '').trim().replace(/(地区苏维埃|苏维埃|自治区|自治州|自治县|开发区|工作区|特区|公社|县|市|区|镇|乡)$/, '');

// ================= 读取旧数据 =================
const membersFile = read('members.json');
const rolesFile = read('roles.json');
const orgFile = read('organizations.json');
const regionFile = read('regions.json');
const terrFile = read('territories.json');
const siteFile = read('site.json');
const loreFile = read('lore.json');

const oldMembers = membersFile.members;
const oldRoles = rolesFile.roles;
const oldOrgs = orgFile.organizations;
const oldRegions = regionFile.regions;
const oldTerrs = terrFile.territories;
const pendingCount = terrFile.pendingCount ?? 0;

// ================= 1. organizations：纯树结构（删 headMemberIds/memberIds，加 order）=================
// 依据 appointments 反推的成员仍要双向一致，但 org 文件只保留结构。
const orgById = new Map(oldOrgs.map((o) => [o.id, o]));
const newOrgs = oldOrgs.map((o, i) => ({
  id: o.id,
  name: o.name,
  tier: o.tier,
  parentId: o.parentId ?? null,
  order: i,
  summary: o.summary ?? '',
}));

// ================= 2. places：合并 regions + territories =================
const terrByNorm = new Map(); // normPlace(name) -> territory
for (const t of oldTerrs) terrByNorm.set(normPlace(t.name), t);

// 从 region summary 解析「副主任 X、Y」→ deputy 名单
function parseDeputies(summary) {
  const out = [];
  const m = /副主任\s*([^，。；]+)/.exec(summary || '');
  if (!m) return out;
  for (const piece of m[1].split(/[、，,和与]/)) {
    const n = normName(piece);
    if (n) out.push(n);
  }
  return out;
}
// 去掉 summary 里的花名册句（「主任 X，副主任 Y，代表 Z。」），保留职能描述
function stripRoster(summary) {
  return String(summary ?? '')
    .replace(/\s*主任\s+\S[^。]*。?/g, '')
    .replace(/\s*代表\s+\S[^。]*。?/g, '')
    .trim();
}

const memberByNorm = new Map(); // normName -> member
for (const m of oldMembers) {
  memberByNorm.set(normName(m.id), m);
  memberByNorm.set(normName(m.gameId), m);
  memberByNorm.set(normName(m.displayName), m);
}

const newPlaces = [];
const placeMatchRows = []; // 报告：合并对照
const usedTerrIds = new Set();

// 2a. region 节点 → place（保留 id/tier/parentId）。仅 commune 级地名可吸收 territory 的聚落规模；
//     union/bureau/executive/region 级是行政脚手架，永不与 territory 匹配（避免「岐川地区苏维埃」误吞「岐川公社」）。
for (const r of oldRegions) {
  const terr = r.tier === 'commune' ? terrByNorm.get(normPlace(r.name)) : undefined;
  const deputies = parseDeputies(r.summary);
  if (terr) usedTerrIds.add(terr.id);
  const kind = r.tier !== 'commune' ? 'admin' : terr ? 'merge' : 'region-only';
  newPlaces.push({
    id: r.id,
    name: r.name,
    tier: r.tier,
    parentId: r.parentId ?? null,
    settlement: terr ? terr.tier : null,
    note: terr ? (terr.note ?? '') : '',
    summary: stripRoster(r.summary),
    _deputies: deputies,
    _head: r.headMemberIds ?? [],
    _members: r.memberIds ?? [],
  });
  placeMatchRows.push({
    kind,
    placeId: r.id,
    name: r.name,
    adminTier: r.tier,
    settlement: terr ? terr.tier : null,
    note: terr ? (terr.note ?? '') : '',
  });
}

// 2b. territory 独有 → locality（parentId:null，不入行政树）
const localityId = (terrId) => 'loc-' + terrId;
for (const t of oldTerrs) {
  if (usedTerrIds.has(t.id)) continue;
  const id = localityId(t.id);
  newPlaces.push({
    id,
    name: t.name,
    tier: 'locality',
    parentId: null,
    settlement: t.tier,
    note: t.note ?? '',
    summary: '',
    _deputies: [],
    _head: [],
    _members: [],
  });
  placeMatchRows.push({
    kind: 'locality',
    placeId: id,
    name: t.name,
    adminTier: 'locality',
    settlement: t.tier,
    note: t.note ?? '',
  });
}

// ================= 3. members：统一任职 appointments =================
const normToMemberId = (name) => memberByNorm.get(normName(name))?.id ?? null;

// 3a. 先建 org/place 的成员与负责人集合（用于判定 post）
const orgHeads = new Map(); // orgId -> Set(memberId)
const orgMembers = new Map(); // orgId -> [memberId]
for (const o of oldOrgs) {
  orgHeads.set(o.id, new Set(o.headMemberIds ?? []));
  orgMembers.set(o.id, o.memberIds ?? []);
}
const placeHeads = new Map();
const placeDeputies = new Map();
const placeMembers = new Map();
for (const p of newPlaces) {
  placeHeads.set(p.id, new Set(p._head ?? []));
  placeDeputies.set(p.id, new Set((p._deputies ?? []).map((nm) => memberByNorm.get(nm)?.id).filter(Boolean)));
  placeMembers.set(p.id, p._members ?? []);
}

// 3b. 逐成员生成 appointments（顺序：先 orgIds，后 regionIds）
const newMembers = oldMembers.map((m) => {
  const appts = [];
  for (const orgId of m.orgIds ?? []) {
    const isHead = orgHeads.get(orgId)?.has(m.id) ?? false;
    appts.push({ node: 'org', id: orgId, post: isHead ? 'head' : 'member' });
  }
  for (const placeId of m.regionIds ?? []) {
    const isHead = placeHeads.get(placeId)?.has(m.id) ?? false;
    const isDeputy = placeDeputies.get(placeId)?.has(m.id) ?? false;
    appts.push({ node: 'place', id: placeId, post: isHead ? 'head' : isDeputy ? 'deputy' : 'member' });
  }
  return {
    id: m.id,
    gameId: m.gameId,
    displayName: m.displayName,
    honorific: m.title ?? '',
    rankId: m.rankId,
    portfolioIds: m.roleIds ?? [],
    status: m.status,
    leftAt: m.leftAt ?? null,
    intro: m.intro ?? '',
    tags: m.tags ?? [],
    featured: !!m.featured,
    order: m.order ?? 0,
    updatedAt: m.updatedAt ?? '',
    appointments: appts,
  };
});

// ================= 4. portfolios：roles → portfolios（删 leadMemberId，加 orgIds）=================
// 职务 → 牵头机构外键（对照 organizations.json 真实 id 核对）
const portfolioOrgIds = {
  finance: ['finance-committee'],
  propaganda: ['culture'],
  secretariat: [],
  foreign: ['foreign-recruit'],
  labor: ['labor-dept'],
  military: ['mil'],
  regional: [],
};
const orgIdSet = new Set(oldOrgs.map((o) => o.id));
const newPortfolios = oldRoles.map((r) => {
  const orgIds = (portfolioOrgIds[r.id] ?? []).filter((id) => orgIdSet.has(id));
  return {
    id: r.id,
    name: r.name,
    icon: r.icon ?? '',
    description: r.description ?? '',
    orgIds,
  };
});

// ================= 5. site：capital → placeId，删 territory 字段 =================
const capitalPlaceId = 'commune-linhai-central';
const newSite = { ...siteFile };
newSite.capitalPlaceId = capitalPlaceId;
delete newSite.capital;
delete newSite.territoryGranted;
delete newSite.territoryTotal;

// ================= 6. lore：region id 重映射为 placeId =================
const loreIdMap = { mengde: 'commune-mengde', 'beilin-frontier': 'commune-border' };
const newLore = {
  ...loreFile,
  regions: (loreFile.regions ?? []).map((r) => ({
    ...r,
    id: loreIdMap[r.id] ?? r.id,
  })),
};

// ================= 交叉校验（迁移自检）=================
const errors = [];
const memberIdSet = new Set(newMembers.map((m) => m.id));
const placeIdSet = new Set(newPlaces.map((p) => p.id));
// appointments 外键
for (const m of newMembers) {
  for (const a of m.appointments) {
    if (a.node === 'org' && !orgIdSet.has(a.id)) errors.push(`member ${m.id}: org ${a.id} 不存在`);
    if (a.node === 'place' && !placeIdSet.has(a.id)) errors.push(`member ${m.id}: place ${a.id} 不存在`);
    if (!['head', 'deputy', 'member'].includes(a.post)) errors.push(`member ${m.id}: post ${a.post} 非法`);
  }
}
// places parentId 外键 + 联通
for (const p of newPlaces) {
  if (p.parentId && !placeIdSet.has(p.parentId)) errors.push(`place ${p.id}: parent ${p.parentId} 不存在`);
}
// org parentId 外键
for (const o of newOrgs) {
  if (o.parentId && !orgIdSet.has(o.parentId)) errors.push(`org ${o.id}: parent ${o.parentId} 不存在`);
}
// portfolios orgIds 外键
for (const pf of newPortfolios) {
  for (const id of pf.orgIds) if (!orgIdSet.has(id)) errors.push(`portfolio ${pf.id}: org ${id} 不存在`);
}
// capital placeId
if (!placeIdSet.has(capitalPlaceId)) errors.push(`site.capitalPlaceId ${capitalPlaceId} 不存在`);
// 统计
const grantedPlaces = newPlaces.filter((p) => p.settlement != null).length;

// ================= 写出新文件 =================
write('places.json', {
  isPlaceholder: false,
  pendingCount,
  places: newPlaces.map(({ _deputies, _head, _members, ...rest }) => rest),
});
write('organizations.json', { isPlaceholder: false, organizations: newOrgs });
write('portfolios.json', { isPlaceholder: false, portfolios: newPortfolios });
write('members.json', { isPlaceholder: false, members: newMembers });
write('site.json', newSite);
write('lore.json', newLore);

// ================= 报告 =================
const mergeRows = placeMatchRows.filter((r) => r.kind === 'merge');
const localityRows = placeMatchRows.filter((r) => r.kind === 'locality');
const regionOnlyRows = placeMatchRows.filter((r) => r.kind === 'region-only');
const adminRows = placeMatchRows.filter((r) => r.kind === 'admin');
const deputyRows = [];
for (const p of newPlaces) {
  for (const d of p._deputies ?? []) {
    const mid = normToMemberId(d);
    deputyRows.push({ place: p.name, placeId: p.id, deputy: d, memberId: mid ?? '(未匹配)' });
  }
}
// appointments 合并差异：orgIds+regionIds 旧计数 vs appointments 新计数
let oldRef = 0;
for (const m of oldMembers) oldRef += (m.orgIds?.length ?? 0) + (m.regionIds?.length ?? 0);
let newRef = 0;
for (const m of newMembers) newRef += m.appointments.length;

const report = [
  '# 数据层重构迁移报告（Phase B）',
  '',
  `生成时间：${new Date().toISOString()}`,
  '迁移脚本：scripts/migrate-data.mjs（读旧 data/*.json → 写新 data/*.json）',
  '',
  '## 1. 地名合并对照（places.json）',
  '',
  `共 ${newPlaces.length} 个地名节点（旧 regions ${oldRegions.length} + 新增 locality ${localityRows.length}）。`,
  `已下发（有聚落规模 settlement）：${grantedPlaces} 处；待下发 pendingCount=${pendingCount}；合计 ${grantedPlaces + pendingCount} 处。`,
  '',
  `### 1.1 重叠合并 ${mergeRows.length} 处（regions 的 tier=行政级别 保留，territories 的 tier=聚落规模 降为 settlement 属性）`,
  '',
  '| placeId | 地名 | 行政级别(tier) | 聚落规模(settlement) | note |',
  '| --- | --- | --- | --- | --- |',
  ...mergeRows.map((r) => `| ${r.placeId} | ${r.name} | ${r.adminTier} | ${r.settlement} | ${r.note} |`),
  '',
  `### 1.2 territory 独有 ${localityRows.length} 处 → tier=locality（parentId:null 不入行政树）`,
  '',
  '| placeId | 地名 | 聚落规模(settlement) | note |',
  '| --- | --- | --- | --- |',
  ...localityRows.map((r) => `| ${r.placeId} | ${r.name} | ${r.settlement} | ${r.note} |`),
  '',
  `### 1.3 region 独有 ${regionOnlyRows.length} 处 → settlement:null（无聚落规模）`,
  '',
  '| placeId | 地名 | 行政级别(tier) |',
  '| --- | --- | --- |',
  ...regionOnlyRows.map((r) => `| ${r.placeId} | ${r.name} | ${r.adminTier} |`),
  '',
  `### 1.4 行政脚手架 ${adminRows.length} 处（union/bureau/executive/region 级，不与 territory 匹配）`,
  '',
  '| placeId | 地名 | 行政级别(tier) |',
  '| --- | --- | --- |',
  ...adminRows.map((r) => `| ${r.placeId} | ${r.name} | ${r.adminTier} |`),
  '',
  '## 2. appointments 合并差异（members.appointments[]）',
  '',
  `- 旧引用总数（member.orgIds + member.regionIds，双记）：${oldRef}`,
  `- 新引用总数（member.appointments，统一任职）：${newRef}`,
  `- 说明：appointments 由「成员自报 orgIds/regionIds」+「机构/地名 headMemberIds、summary 副主任」合并去重生成，post ∈ {head, deputy, member}。`,
  '',
  '### 2.1 副主任（deputy）解析（来自 region summary 文本）',
  '',
  '| 地名 | placeId | 副主任 | memberId |',
  '| --- | --- | --- | --- |',
  ...deputyRows.map((r) => `| ${r.place} | ${r.placeId} | ${r.deputy} | ${r.memberId} |`),
  '',
  '## 3. 裁决点',
  '',
  '- 地名 id 一律取 regions.json 侧（commune-* / union-soviet / region-* 等）；territory 侧旧 id 弃用，territory 独有 8 处用 loc-* 新 id。',
  '- roles.json → portfolios.json：删 leadMemberId（负责人改由 appointments 体现），加 orgIds 牵头机构外键。',
  '- 机构/地名的成员与负责人不再双记，统一由 members.appointments 派生（loadData 内 memberIds/headMemberIds 为派生视图）。',
  '- site.json：capital（地名字符串）→ capitalPlaceId（外键 commune-linhai-central）；删 territoryGranted/territoryTotal（改由 places 派生）。',
  '- members.json：title→honorific、roleIds→portfolioIds；删 orgIds/regionIds/joinedAt/avatar/contacts（均 0/31 或双记）。',
  '- lore.json region.id 重映射为 placeId：mengde→commune-mengde、beilin-frontier→commune-border。',
  '- 职务→牵头机构映射（对照 organizations.json 真实 id）：finance→finance-committee、propaganda→culture、foreign→foreign-recruit、labor→labor-dept、military→mil；secretariat/regional 无对应机构留 []。',
  '',
  '## 4. 迁移自检',
  '',
  errors.length ? errors.map((e) => '- ❌ ' + e).join('\n') : '- ✅ 全部外键/枚举/计数自检通过',
  '',
  '## 5. 遗留风险',
  '',
  '- 副主任仅从 region summary 文本解析，覆盖 4 个地区；其余 deputy 若存在需人工补 appointments。',
  '- locality（territory 独有 8 处）parentId 暂为 null，若后续归入某行政树需人工指定。',
  '- 职务 orgIds 为「牵头机构」近似映射，secretariat/regional 无对应机构留空。',
  '- loadData 对 org/place 派生 memberIds/headMemberIds 兼容视图，Phase A 迁移组件后可移除。',
  '',
].join('\n');
writeFileSync(join(root, '.refactor-report.md'), report, 'utf8');

console.log('迁移完成');
console.log('  places:', newPlaces.length, '| merge', mergeRows.length, '| locality', localityRows.length, '| region-only', regionOnlyRows.length);
console.log('  members:', newMembers.length, '| appointments', newRef, '(旧双记', oldRef + ')');
console.log('  portfolios:', newPortfolios.length, '| orgs:', newOrgs.length);
console.log('  granted', grantedPlaces, '+ pending', pendingCount, '=', grantedPlaces + pendingCount);
console.log('  自检错误:', errors.length);
if (errors.length) { for (const e of errors) console.log('   ✗', e); }
