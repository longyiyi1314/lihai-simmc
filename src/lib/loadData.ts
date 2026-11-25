import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { z } from 'zod';
import {
  SiteSchema,
  RankFileSchema,
  PortfoliosFileSchema,
  MembersFileSchema,
  OrganizationFileSchema,
  PlaceFileSchema,
  LoreFileSchema,
} from './schema';

const DATA_DIR = join(process.cwd(), 'data');

class DataError extends Error {}

/** 逐条格式化 zod 报错，输出「哪个文件第几条哪个字段错了」 */
function formatIssues(zodError: z.ZodError, label: string): string[] {
  return zodError.issues.map((i) => {
    const path = i.path.length ? i.path.join('.') : '(根)';
    return `  ${label} → ${path}：${i.message}`;
  });
}

function readJson<T>(file: string, schema: z.ZodType<T>): T {
  const full = join(DATA_DIR, file);
  if (!existsSync(full)) {
    throw new DataError(`找不到数据文件：data/${file}`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(full, 'utf8'));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new DataError(`data/${file} 不是合法 JSON：${msg}`);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new DataError(
      `data/${file} 校验失败：\n${formatIssues(parsed.error, file).join('\n')}`
    );
  }
  return parsed.data;
}

// ================= 读取（新模型）=================
const site = readJson('site.json', SiteSchema);
const ranks = readJson('ranks.json', RankFileSchema);
const portfolios = readJson('portfolios.json', PortfoliosFileSchema);
const members = readJson('members.json', MembersFileSchema);
const organizations = readJson('organizations.json', OrganizationFileSchema);
const places = readJson('places.json', PlaceFileSchema);
const lore = readJson('lore.json', LoreFileSchema);

// ================= 一致性校验 =================
function crossValidate() {
  const errors: string[] = [];
  const push = (m: string) => errors.push(m);

  const rankIds = new Set<string>();
  const rankLevels = new Set<number>();
  for (const r of ranks.ranks) {
    if (rankIds.has(r.id)) push(`ranks.json：职级 id 重复 ${r.id}`);
    rankIds.add(r.id);
    if (rankLevels.has(r.level)) push(`ranks.json：职级 level 重复 ${r.level}`);
    rankLevels.add(r.level);
  }

  const portfolioIds = new Set<string>();
  for (const p of portfolios.portfolios) {
    if (portfolioIds.has(p.id)) push(`portfolios.json：职务 id 重复 ${p.id}`);
    portfolioIds.add(p.id);
  }

  const orgIds = new Set<string>();
  for (const o of organizations.organizations) {
    if (orgIds.has(o.id)) push(`organizations.json：机构 id 重复 ${o.id}`);
    orgIds.add(o.id);
  }
  for (const o of organizations.organizations) {
    if (o.parentId && !orgIds.has(o.parentId))
      push(`organizations.json：${o.name} 的上级 ${o.parentId} 不存在`);
  }

  const placeIds = new Set<string>();
  for (const p of places.places) {
    if (placeIds.has(p.id)) push(`places.json：地名 id 重复 ${p.id}`);
    placeIds.add(p.id);
  }
  for (const p of places.places) {
    if (p.parentId && !placeIds.has(p.parentId))
      push(`places.json：${p.name} 的上级 ${p.parentId} 不存在`);
  }

  const memberIds = new Set<string>();
  for (const m of members.members) {
    if (memberIds.has(m.id)) push(`members.json：成员 id 重复 ${m.id}`);
    memberIds.add(m.id);
    if (!rankIds.has(m.rankId)) push(`members.json：${m.displayName} 的职级 ${m.rankId} 不存在`);
    for (const pid of m.portfolioIds)
      if (!portfolioIds.has(pid))
        push(`members.json：${m.displayName} 的职务 ${pid} 不存在`);
    if (m.status === 'left' && !m.leftAt)
      push(`members.json：${m.displayName} 状态为已离会但缺少离会时间`);
    for (const a of m.appointments) {
      if (a.node === 'org' && !orgIds.has(a.id))
        push(`members.json：${m.displayName} 任职的机构 ${a.id} 不存在`);
      if (a.node === 'place' && !placeIds.has(a.id))
        push(`members.json：${m.displayName} 任职的地名 ${a.id} 不存在`);
    }
  }

  // 职务牵头机构外键
  for (const p of portfolios.portfolios)
    for (const id of p.orgIds)
      if (!orgIds.has(id)) push(`portfolios.json：${p.name} 的牵头机构 ${id} 不存在`);

  // 首府地名外键
  if (site.capitalPlaceId && !placeIds.has(site.capitalPlaceId))
    push(`site.json：capitalPlaceId ${site.capitalPlaceId} 不存在`);

  // featured 名额
  const featured = members.members.filter((m) => m.featured).length;
  if (featured > 8) push(`members.json：featured 超过 8 人（${featured}）`);

  // 职级名额
  const rankCount = new Map<string, number>();
  for (const m of members.members)
    if (m.status === 'active') rankCount.set(m.rankId, (rankCount.get(m.rankId) ?? 0) + 1);
  for (const r of ranks.ranks) {
    if (r.limit != null && (rankCount.get(r.id) ?? 0) > r.limit)
      push(`ranks.json：职级 ${r.name} 在任 ${rankCount.get(r.id)} 人，超过名额 ${r.limit}`);
  }

  // 全社人数不得小于名录人数
  if (site.memberTotal && site.memberTotal < members.members.length) {
    push(
      `site.json：memberTotal（${site.memberTotal}）小于 members.json 收录的 ${members.members.length} 人`
    );
  }

  if (errors.length) {
    throw new DataError(
      `数据一致性校验失败（共 ${errors.length} 处）：\n` +
        errors.map((e) => `  ✗ ${e}`).join('\n')
    );
  }
}
crossValidate();

// ================= 职级 =================
export const rankList = [...ranks.ranks].sort((a, b) => b.level - a.level);
export const rankMap = new Map(rankList.map((r) => [r.id, r]));

// ================= 机构 / 地名 派生成员（统一由 appointments 推导）=================
type Post = 'head' | 'deputy' | 'member';
type Appt = { node: 'org' | 'place'; id: string; post: Post };

const orgMembersMap = new Map<string, string[]>();
const orgHeadsMap = new Map<string, string[]>();
const placeMembersMap = new Map<string, string[]>();
const placeHeadsMap = new Map<string, string[]>();
for (const o of organizations.organizations) {
  orgMembersMap.set(o.id, []);
  orgHeadsMap.set(o.id, []);
}
for (const p of places.places) {
  placeMembersMap.set(p.id, []);
  placeHeadsMap.set(p.id, []);
}
// memberList 需先排序，保证派生成员顺序稳定（名册顺序）
const sortedMembers = [...members.members].sort((a, b) => {
  const ra = rankList.findIndex((r) => r.id === a.rankId);
  const rb = rankList.findIndex((r) => r.id === b.rankId);
  if (ra !== rb) return ra - rb;
  return a.order - b.order;
});
for (const m of sortedMembers) {
  for (const a of m.appointments as Appt[]) {
    const bucket = a.node === 'org' ? orgMembersMap : placeMembersMap;
    const headBucket = a.node === 'org' ? orgHeadsMap : placeHeadsMap;
    bucket.get(a.id)?.push(m.id);
    if (a.post === 'head') headBucket.get(a.id)?.push(m.id);
  }
}

// ================= 成员（派生兼容视图：roleIds/title 等，Phase A 迁移组件后移除）=================
type RawMember = (typeof members.members)[number];
type CompatMember = RawMember & {
  roleIds: string[];
  title: string;
  avatar: string;
  joinedAt: string;
  contacts: Record<string, string>;
};
const withMemberCompat = (m: RawMember): CompatMember => ({
  ...m,
  roleIds: m.portfolioIds,
  title: m.honorific,
  avatar: '',
  joinedAt: '',
  contacts: {},
});

export const memberList: CompatMember[] = sortedMembers.map(withMemberCompat);
export const memberMap = new Map(memberList.map((m) => [m.id, m]));

// ================= 机构（纯树 + 派生 memberIds/headMemberIds 兼容视图）=================
type RawOrg = (typeof organizations.organizations)[number];
type CompatOrg = RawOrg & { memberIds: string[]; headMemberIds: string[] };
export const organizationList: CompatOrg[] = organizations.organizations.map((o) => ({
  ...o,
  memberIds: orgMembersMap.get(o.id) ?? [],
  headMemberIds: orgHeadsMap.get(o.id) ?? [],
}));
export const organizationMap = new Map(organizationList.map((o) => [o.id, o]));

export const orgTiers = [
  { id: 'root', name: '凛海局', weight: 100 },
  { id: 'committee', name: '委员会', weight: 90 },
  { id: 'department', name: '部', weight: 80 },
  { id: 'bureau', name: '局', weight: 70 },
  { id: 'division', name: '处', weight: 60 },
  { id: 'unit', name: '军队单位', weight: 70 },
] as const;
export const orgTierMap = new Map(orgTiers.map((t) => [t.id, t]));

export function childrenOf(parentId: string | null) {
  return organizationList
    .filter((o) => o.parentId === parentId)
    .sort(
      (a, b) =>
        (orgTierMap.get(b.tier)?.weight ?? 0) - (orgTierMap.get(a.tier)?.weight ?? 0)
    );
}
export const childrenOfOrg = childrenOf;
export const rootOrganizations = childrenOf(null);

export function membersOfOrg(orgId: string) {
  return (orgMembersMap.get(orgId) ?? [])
    .map((id) => memberMap.get(id))
    .filter((m): m is CompatMember => Boolean(m));
}
export function headsOfOrg(orgId: string) {
  return orgHeadsMap.get(orgId) ?? [];
}
export function orgsOfMember(memberId: string) {
  const m = memberMap.get(memberId);
  if (!m) return [];
  return (m.appointments as Appt[])
    .filter((a) => a.node === 'org')
    .map((a) => organizationMap.get(a.id))
    .filter((o): o is CompatOrg => Boolean(o));
}
export function appointmentsOf(memberId: string): Appt[] {
  return (memberMap.get(memberId)?.appointments ?? []) as Appt[];
}

// ================= 地名（合并树 + 派生 memberIds/headMemberIds 兼容视图）=================
type RawPlace = (typeof places.places)[number];
type CompatPlace = RawPlace & { memberIds: string[]; headMemberIds: string[] };
export const placeList: CompatPlace[] = places.places.map((p) => ({
  ...p,
  memberIds: placeMembersMap.get(p.id) ?? [],
  headMemberIds: placeHeadsMap.get(p.id) ?? [],
}));
export const placeMap = new Map(placeList.map((p) => [p.id, p]));

/** 地名行政级别（含 locality） */
export const placeTiers = [
  { id: 'union', name: '最高苏维埃', weight: 100 },
  { id: 'bureau', name: '凛海局', weight: 90 },
  { id: 'executive', name: '中央执行委员会', weight: 80 },
  { id: 'region', name: '地区苏维埃', weight: 70 },
  { id: 'commune', name: '公社', weight: 60 },
  { id: 'locality', name: '聚落点', weight: 50 },
] as const;
export const placeTierMap = new Map(placeTiers.map((t) => [t.id, t]));

/** 行政地名（排除纯聚落点）——对应原 regions 视图 */
export const adminPlaces = placeList.filter((p) => p.tier !== 'locality');

export function childrenOfPlace(parentId: string | null) {
  return placeList
    .filter((p) => p.parentId === parentId)
    .sort(
      (a, b) =>
        (placeTierMap.get(b.tier)?.weight ?? 0) - (placeTierMap.get(a.tier)?.weight ?? 0)
    );
}
export const rootPlaces = childrenOfPlace(null);

export function membersOfPlace(placeId: string) {
  return (placeMembersMap.get(placeId) ?? [])
    .map((id) => memberMap.get(id))
    .filter((m): m is CompatMember => Boolean(m));
}
export function headsOfPlace(placeId: string) {
  return placeHeadsMap.get(placeId) ?? [];
}
export function placesOfMember(memberId: string) {
  const m = memberMap.get(memberId);
  if (!m) return [];
  return (m.appointments as Appt[])
    .filter((a) => a.node === 'place')
    .map((a) => placeMap.get(a.id))
    .filter((p): p is CompatPlace => Boolean(p));
}

// ================= 聚落规模（原领地）=================
export const settlementTiers = [
  { id: 'capital', name: '首都', weight: 80 },
  { id: 'metro', name: '都市圈', weight: 70 },
  { id: 'city', name: '城市', weight: 60 },
  { id: 'territory', name: '领地', weight: 50 },
  { id: 'province', name: '省份', weight: 40 },
  { id: 'town', name: '城镇', weight: 30 },
  { id: 'village', name: '村庄', weight: 20 },
  { id: 'settlement', name: '定居点', weight: 10 },
] as const;
export const settlementTierMap = new Map(settlementTiers.map((t) => [t.id, t]));

/** 已下发领地 = 有聚落规模的地名 */
export const territoryList = placeList
  .filter((p) => p.settlement != null)
  .sort(
    (a, b) =>
      (settlementTierMap.get(b.settlement!)?.weight ?? 0) -
      (settlementTierMap.get(a.settlement!)?.weight ?? 0)
  );
export function territoriesOfTier(tier: string) {
  return territoryList.filter((t) => t.settlement === tier);
}

// ================= 职务 =================
export const portfolioList = portfolios.portfolios;
export const portfolioMap = new Map(portfolioList.map((p) => [p.id, p]));
export function membersOfPortfolio(portfolioId: string) {
  return activeMembers.filter((m) => m.portfolioIds.includes(portfolioId));
}

// ================= 地区介绍（lore）=================
export const loreNote = lore.note;
export const loreRegions = lore.regions;
export const loreRegionMap = new Map(loreRegions.map((r) => [r.id, r]));
export const allLoreWonders = loreRegions.flatMap((r) => r.wonders);
export function wondersOfRegion(regionId: string) {
  return loreRegionMap.get(regionId)?.wonders ?? [];
}
/** 地名外键 → 地区介绍（精确 placeId 匹配，返回 {id,name} 或 null） */
export function loreOfPlace(placeId: string) {
  return loreRegionMap.get(placeId) ?? null;
}

// ================= 现役 / 名单视图 =================
export const activeMembers = memberList.filter(
  (m) => m.status === 'active' || m.status === 'reserve'
);
export const alumniMembers = memberList.filter(
  (m) => m.status === 'honorary' || m.status === 'left'
);
export const featuredMembers = activeMembers.filter((m) => m.featured).slice(0, 8);
export function membersOfRank(rankId: string) {
  return activeMembers.filter((m) => m.rankId === rankId);
}

// ================= site 派生显示值（首府名 / 领地计数）=================
const capitalName = placeMap.get(site.capitalPlaceId)?.name ?? '';
const territoryGranted = territoryList.length;
const territoryTotal = territoryGranted + places.pendingCount;
export const siteView = Object.assign({}, site, {
  capital: capitalName,
  capitalPlaceId: site.capitalPlaceId,
  territoryGranted,
  territoryTotal,
});
// 覆盖导出：页面统一用 site.capital / site.territoryTotal / site.territoryGranted
export { siteView as site };
export const capitalName_ = capitalName;

// ================= 兼容别名（旧导出名，Phase A 迁移组件后删除）=================
export const roleList = portfolioList;
export const roleMap = portfolioMap;
export const membersOfRole = membersOfPortfolio;
export const regionList = adminPlaces;
export const regionMap = placeMap;
export const regionTiers = placeTiers.filter((t) => t.id !== 'locality');
export const regionTierMap = new Map(regionTiers.map((t) => [t.id, t]));
export const childrenOfRegion = childrenOfPlace;
export const rootRegions = rootPlaces.filter((p) => p.tier !== 'locality');
export const regionsOfMember = placesOfMember;
export const territoryTiers = settlementTiers;
export const territoryTierMap = settlementTierMap;
export const loreIntroOf = loreOfPlace;

export { ranks, portfolios, members, organizations, places, lore };

// ================= 工具 =================
export const isPlaceholder = Boolean(
  members.isPlaceholder ||
    ranks.isPlaceholder ||
    portfolios.isPlaceholder ||
    places.isPlaceholder
);
export const placeholderNotice = isPlaceholder
  ? '当前为示例数据 · 正式名单录入后自动替换'
  : '';

/** 由名字生成头像占位用的首字 */
export function initialOf(name: string) {
  const chars = [...name.trim()];
  return chars[0] ?? '?';
}

/** 生成稳定色相，用于无头像时的占位色 */
export function hueOf(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}

export function formatMonth(m: string) {
  if (!m) return '';
  const [y, mo] = m.split('-');
  return mo ? `${y} 年 ${Number(mo)} 月` : '';
}

/** 2025-12-27 + 09:26 → 2025 年 12 月 27 日 09:26 */
export function formatDateFull(d: string, t = '') {
  if (!d) return '';
  const [y, mo, day] = d.split('-');
  if (!day) return formatMonth(d);
  const base = `${y} 年 ${Number(mo)} 月 ${Number(day)} 日`;
  return t ? `${base} ${t}` : '';
}

export const statusLabel: Record<string, string> = {
  active: '在任',
  reserve: '休假',
  honorary: '荣誉',
  left: '已离会',
};
