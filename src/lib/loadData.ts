import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { z } from 'zod';
import {
  SiteSchema,
  RankFileSchema,
  RolesFileSchema,
  MembersFileSchema,
  TerritoryFileSchema,
  OrganizationFileSchema,
  RegionFileSchema,
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

/** 跨文件一致性校验：外键、唯一性、头像文件、名额 */
function crossValidate(data: {
  site: z.infer<typeof SiteSchema>;
  ranks: z.infer<typeof RankFileSchema>;
  roles: z.infer<typeof RolesFileSchema>;
  members: z.infer<typeof MembersFileSchema>;
  territories: z.infer<typeof TerritoryFileSchema>;
  organizations: z.infer<typeof OrganizationFileSchema>;
  regions: z.infer<typeof RegionFileSchema>;
}) {
  const errors: string[] = [];
  const { ranks, roles, members, territories, site, organizations, regions } = data;

  // 1. 职位 id 唯一
  const rankIds = new Set<string>();
  for (const r of ranks.ranks) {
    if (rankIds.has(r.id)) errors.push(`ranks.json：「${r.id}」职位 id 重复`);
    rankIds.add(r.id);
  }

  // 2. 职位 level 不得重复
  const levels = new Map<number, string>();
  for (const r of ranks.ranks) {
    if (levels.has(r.level)) {
      errors.push(
        `ranks.json：层级值 ${r.level} 重复（「${levels.get(r.level)}」与「${r.name}」）`
      );
    }
    levels.set(r.level, r.name);
  }

  // 3. 职务 id 唯一
  const roleIds = new Set<string>();
  for (const r of roles.roles) {
    if (roleIds.has(r.id)) errors.push(`roles.json：「${r.id}」职务 id 重复`);
    roleIds.add(r.id);
  }

  // 4. 成员 id 唯一
  const memberIds = new Set<string>();
  for (const m of members.members) {
    if (memberIds.has(m.id)) {
      errors.push(`members.json：「${m.id}」成员 id 重复（URL 会撞车）`);
    }
    memberIds.add(m.id);
  }

  // 5. 成员的 rankId / roleIds 外键必须存在
  for (const m of members.members) {
    const who = `members.json 的「${m.displayName || m.id}」`;
    if (!rankIds.has(m.rankId)) {
      errors.push(
        `${who}：职位 rankId "${m.rankId}" 不存在，可用值：${[...rankIds].join(' / ')}`
      );
    }
    for (const rid of m.roleIds) {
      if (!roleIds.has(rid)) {
        errors.push(
          `${who}：职务 roleId "${rid}" 不存在，可用值：${[...roleIds].join(' / ')}`
        );
      }
    }
  }

  // 6. status=left 必须有 leftAt；荣誉成员可选填 leftAt（授予荣誉后离开的情形），其余状态不填
  for (const m of members.members) {
    if (m.status === 'left' && !m.leftAt) {
      errors.push(`members.json 的「${m.displayName}」：status=left 但没填 leftAt`);
    }
    if (m.status !== 'left' && m.status !== 'honorary' && m.leftAt) {
      errors.push(
        `members.json 的「${m.displayName}」：status=${m.status} 却填了 leftAt（只有已离会或荣誉成员才填）`
      );
    }
  }

  // 7. 头像文件必须真实存在（填了才校验）
  const publicDir = join(process.cwd(), 'public');
  for (const m of members.members) {
    if (!m.avatar) continue;
    const rel = m.avatar.replace(/^\//, '');
    if (!existsSync(join(publicDir, rel))) {
      errors.push(
        `members.json 的「${m.displayName}」：头像文件不存在 → public/${rel}`
      );
    }
  }

  // 8. 首页精选不超过 8 人
  const featured = members.members.filter((m) => m.featured);
  if (featured.length > 8) {
    errors.push(
      `members.json：featured=true 有 ${featured.length} 人，最多 8 人（首页放不下）`
    );
  }

  // 9. 职务负责人 leadMemberId 必须存在
  for (const r of roles.roles) {
    if (r.leadMemberId && !memberIds.has(r.leadMemberId)) {
      errors.push(
        `roles.json 的「${r.name}」：负责人 leadMemberId "${r.leadMemberId}" 不存在`
      );
    }
  }

  // 9b. 机构 id 唯一
  const orgIds = new Set<string>();
  for (const o of organizations.organizations) {
    if (orgIds.has(o.id)) {
      errors.push(`organizations.json：机构 id「${o.id}」重复`);
    }
    orgIds.add(o.id);
  }

  // 9c. 机构 parentId 必须存在且不能指向自己
  for (const o of organizations.organizations) {
    if (o.parentId === null) continue;
    if (o.parentId === o.id) {
      errors.push(`organizations.json 的「${o.name}」：parentId 不能指向自己`);
    } else if (!orgIds.has(o.parentId)) {
      errors.push(
        `organizations.json 的「${o.name}」：上级机构 parentId "${o.parentId}" 不存在`
      );
    }
  }

  // 9d. 机构负责人/成员必须是真实成员，且负责人应包含在成员内
  for (const o of organizations.organizations) {
    for (const mid of [...o.headMemberIds, ...o.memberIds]) {
      if (!memberIds.has(mid)) {
        errors.push(
          `organizations.json 的「${o.name}」：成员 id "${mid}" 不存在于 members.json`
        );
      }
    }
    for (const h of o.headMemberIds) {
      if (!o.memberIds.includes(h)) {
        errors.push(
          `organizations.json 的「${o.name}」：负责人「${h}」必须同时出现在 memberIds 中`
        );
      }
    }
  }

  // 9e. 成员 orgIds 外键必须存在
  for (const m of members.members) {
    for (const oid of m.orgIds) {
      if (!orgIds.has(oid)) {
        errors.push(
          `members.json 的「${m.displayName || m.id}」：任职机构 orgId "${oid}" 不存在`
        );
      }
    }
  }

  // 9f. 成员 orgIds 与机构 memberIds 必须双向一致
  for (const o of organizations.organizations) {
    for (const mid of o.memberIds) {
      const m = members.members.find((x) => x.id === mid);
      if (m && !m.orgIds.includes(o.id)) {
        errors.push(
          `organizations.json 的「${o.name}」列有「${mid}」，但其成员 orgIds 未回填该机构`
        );
      }
    }
  }
  for (const m of members.members) {
    for (const oid of m.orgIds) {
      const o = organizations.organizations.find((x) => x.id === oid);
      if (o && !o.memberIds.includes(m.id)) {
        errors.push(
          `members.json 的「${m.displayName}」orgIds 含「${o.name}」，但该机构 memberIds 未列入`
        );
      }
    }
  }

  // 9g. 地区节点 id 唯一
  const regionNodeIds = new Set<string>();
  for (const r of regions.regions) {
    if (regionNodeIds.has(r.id)) {
      errors.push(`regions.json：节点 id「${r.id}」重复`);
    }
    regionNodeIds.add(r.id);
  }

  // 9h. 地区节点 parentId 必须存在且不能指向自己
  for (const r of regions.regions) {
    if (r.parentId === null) continue;
    if (r.parentId === r.id) {
      errors.push(`regions.json 的「${r.name}」：parentId 不能指向自己`);
    } else if (!regionNodeIds.has(r.parentId)) {
      errors.push(
        `regions.json 的「${r.name}」：上级节点 parentId "${r.parentId}" 不存在`
      );
    }
  }

  // 9i. 地区节点负责人/成员必须是真实成员，且负责人应包含在成员内
  for (const r of regions.regions) {
    for (const mid of [...r.headMemberIds, ...r.memberIds]) {
      if (!memberIds.has(mid)) {
        errors.push(
          `regions.json 的「${r.name}」：成员 id "${mid}" 不存在于 members.json`
        );
      }
    }
    for (const h of r.headMemberIds) {
      if (!r.memberIds.includes(h)) {
        errors.push(
          `regions.json 的「${r.name}」：负责人「${h}」必须同时出现在 memberIds 中`
        );
      }
    }
  }

  // 9j. 成员 regionIds 外键必须存在
  for (const m of members.members) {
    for (const rid of m.regionIds) {
      if (!regionNodeIds.has(rid)) {
        errors.push(
          `members.json 的「${m.displayName || m.id}」：任职地区 regionId "${rid}" 不存在`
        );
      }
    }
  }

  // 9k. 成员 regionIds 与节点 memberIds 必须双向一致
  for (const r of regions.regions) {
    for (const mid of r.memberIds) {
      const m = members.members.find((x) => x.id === mid);
      if (m && !m.regionIds.includes(r.id)) {
        errors.push(
          `regions.json 的「${r.name}」列有「${mid}」，但其成员 regionIds 未回填该节点`
        );
      }
    }
  }
  for (const m of members.members) {
    for (const rid of m.regionIds) {
      const r = regions.regions.find((x) => x.id === rid);
      if (r && !r.memberIds.includes(m.id)) {
        errors.push(
          `members.json 的「${m.displayName}」regionIds 含「${r.name}」，但该节点 memberIds 未列入`
        );
      }
    }
  }

  // 10. 领地 id 唯一
  const territoryIds = new Set<string>();
  for (const t of territories.territories) {
    if (territoryIds.has(t.id)) {
      errors.push(`territories.json：「${t.id}」领地 id 重复`);
    }
    territoryIds.add(t.id);
  }

  // 11. 领地数量与 site.json 的总数口径一致
  const granted = territories.territories.length;
  if (site.territoryGranted && site.territoryGranted !== granted) {
    errors.push(
      `territories.json：实际列出 ${granted} 处已下发领地，但 site.json 的 territoryGranted 写的是 ${site.territoryGranted}`
    );
  }
  if (
    site.territoryTotal &&
    site.territoryGranted &&
    site.territoryTotal !== site.territoryGranted + territories.pendingCount
  ) {
    errors.push(
      `site.json：territoryTotal（${site.territoryTotal}）应等于 territoryGranted（${site.territoryGranted}）+ territories.json 的 pendingCount（${territories.pendingCount}）`
    );
  }

  // 12. 全社人数不得小于名录里的人数
  if (site.memberTotal && site.memberTotal < members.members.length) {
    errors.push(
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

const site = readJson('site.json', SiteSchema);
const ranks = readJson('ranks.json', RankFileSchema);
const roles = readJson('roles.json', RolesFileSchema);
const members = readJson('members.json', MembersFileSchema);
const territories = readJson('territories.json', TerritoryFileSchema);
const organizations = readJson('organizations.json', OrganizationFileSchema);
const regions = readJson('regions.json', RegionFileSchema);
const lore = readJson('lore.json', LoreFileSchema);

crossValidate({ site, ranks, roles, members, territories, organizations, regions });

/** 职位按 level 从高到低 */
export const rankList = [...ranks.ranks].sort((a, b) => b.level - a.level);
export const roleList = roles.roles;
export const memberList = [...members.members].sort((a, b) => {
  const ra = rankList.findIndex((r) => r.id === a.rankId);
  const rb = rankList.findIndex((r) => r.id === b.rankId);
  if (ra !== rb) return ra - rb;
  return a.order - b.order;
});

export const rankMap = new Map(rankList.map((r) => [r.id, r]));
export const roleMap = new Map(roleList.map((r) => [r.id, r]));

export { site, ranks, roles, members, territories, organizations, regions };

/** 机构等级：显示名与权重（权重越高层级越高） */
export const orgTiers = [
  { id: 'root', name: '凛海局', weight: 100 },
  { id: 'committee', name: '委员会', weight: 90 },
  { id: 'department', name: '部', weight: 80 },
  { id: 'bureau', name: '局', weight: 70 },
  { id: 'division', name: '处', weight: 60 },
  { id: 'unit', name: '军队单位', weight: 70 },
] as const;

export const orgTierMap = new Map(orgTiers.map((t) => [t.id, t]));

export const organizationList = organizations.organizations;
export const organizationMap = new Map(organizationList.map((o) => [o.id, o]));

/** 某机构的直接下级，按等级权重、再按数组顺序 */
export function childrenOf(parentId: string | null) {
  return organizationList
    .filter((o) => o.parentId === parentId)
    .sort(
      (a, b) =>
        (orgTierMap.get(b.tier)?.weight ?? 0) - (orgTierMap.get(a.tier)?.weight ?? 0)
    );
}

/** 根机构（parentId 为 null） */
export const rootOrganizations = childrenOf(null);

/** 某机构下的成员对象（负责人优先） */
export function membersOfOrg(orgId: string) {
  const o = organizationMap.get(orgId);
  if (!o) return [];
  return o.memberIds
    .map((id) => memberList.find((m) => m.id === id))
    .filter((m): m is NonNullable<typeof m> => Boolean(m));
}

/** 某成员任职的机构对象 */
export function orgsOfMember(memberId: string) {
  const m = memberList.find((x) => x.id === memberId);
  if (!m) return [];
  return m.orgIds
    .map((id) => organizationMap.get(id))
    .filter((o): o is NonNullable<typeof o> => Boolean(o));
}

/** 行政区划层级：显示名与权重（权重越高层级越高） */
export const regionTiers = [
  { id: 'union', name: '最高苏维埃', weight: 100 },
  { id: 'bureau', name: '凛海局', weight: 90 },
  { id: 'executive', name: '中央执行委员会', weight: 80 },
  { id: 'region', name: '地区苏维埃', weight: 70 },
  { id: 'commune', name: '公社', weight: 60 },
] as const;

export const regionTierMap = new Map(regionTiers.map((t) => [t.id, t]));

export const regionList = regions.regions;
export const regionMap = new Map(regionList.map((r) => [r.id, r]));

/** 地区介绍 / 奇观（富文本） */
export const loreNote = lore.note;
export const loreRegions = lore.regions;
export const loreRegionMap = new Map(loreRegions.map((r) => [r.id, r]));
export const allLoreWonders = loreRegions.flatMap((r) => r.wonders);
export function wondersOfRegion(regionId: string) {
  return loreRegionMap.get(regionId)?.wonders ?? [];
}

/** 归一化地名后缀，用于把「蒙德」和「蒙德公社」这类写法对上 */
function normPlace(s: string) {
  return s
    .trim()
    .replace(/(地区苏维埃|苏维埃|自治区|自治州|自治县|开发区|工作区|特区|公社|县|市|区|镇|乡)$/, '');
}

/** 地名（含后缀变体）→ 地区介绍锚点 */
const loreIntroByPlace = new Map<string, { id: string; name: string }>();
for (const r of loreRegions) {
  loreIntroByPlace.set(normPlace(r.name), { id: r.id, name: r.name });
}
/** 某个地名是否有对应「地区介绍」，返回 {id,name} 或 null */
export function loreIntroOf(placeName: string) {
  return loreIntroByPlace.get(normPlace(placeName)) ?? null;
}

/** 某节点的直接下级，按层级权重、再按数组顺序 */
export function childrenOfRegion(parentId: string | null) {
  return regionList
    .filter((r) => r.parentId === parentId)
    .sort(
      (a, b) =>
        (regionTierMap.get(b.tier)?.weight ?? 0) -
        (regionTierMap.get(a.tier)?.weight ?? 0)
    );
}

/** 根节点（parentId 为 null） */
export const rootRegions = childrenOfRegion(null);

/** 某成员任职的地区/公社节点对象 */
export function regionsOfMember(memberId: string) {
  const m = memberList.find((x) => x.id === memberId);
  if (!m) return [];
  return m.regionIds
    .map((id) => regionMap.get(id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r));
}

/** 领地层级：显示名与权重（用于分组排序） */
export const territoryTiers = [
  { id: 'capital', name: '首都', weight: 80 },
  { id: 'metro', name: '都市圈', weight: 70 },
  { id: 'city', name: '城市', weight: 60 },
  { id: 'territory', name: '领地', weight: 50 },
  { id: 'province', name: '省份', weight: 40 },
  { id: 'town', name: '城镇', weight: 30 },
  { id: 'village', name: '村庄', weight: 20 },
  { id: 'settlement', name: '定居点', weight: 10 },
] as const;

export const territoryTierMap = new Map(territoryTiers.map((t) => [t.id, t]));

/** 领地按层级权重排序 */
export const territoryList = [...territories.territories].sort(
  (a, b) =>
    (territoryTierMap.get(b.tier)?.weight ?? 0) -
    (territoryTierMap.get(a.tier)?.weight ?? 0)
);

export function territoriesOfTier(tier: string) {
  return territoryList.filter((t) => t.tier === tier);
}

/** 在任 + 休假 = 现役名单；荣誉/已离会单独分区 */
export const activeMembers = memberList.filter(
  (m) => m.status === 'active' || m.status === 'reserve'
);
export const alumniMembers = memberList.filter(
  (m) => m.status === 'honorary' || m.status === 'left'
);

export const featuredMembers = activeMembers.filter((m) => m.featured).slice(0, 8);

/** 某职位下的现役成员 */
export function membersOfRank(rankId: string) {
  return activeMembers.filter((m) => m.rankId === rankId);
}

/** 某职务下的现役成员 */
export function membersOfRole(rankId: string) {
  return activeMembers.filter((m) => m.roleIds.includes(rankId));
}

export const isPlaceholder = Boolean(
  members.isPlaceholder || ranks.isPlaceholder || roles.isPlaceholder
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
