import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { z } from 'zod';
import {
  SiteSchema,
  RankFileSchema,
  OrgFileSchema,
  MembersFileSchema,
  TerritoryFileSchema,
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

/** 跨文件一致性校验：外键、唯一性、头像文件、名额、机构树 */
function crossValidate(data: {
  site: z.infer<typeof SiteSchema>;
  ranks: z.infer<typeof RankFileSchema>;
  org: z.infer<typeof OrgFileSchema>;
  members: z.infer<typeof MembersFileSchema>;
  territories: z.infer<typeof TerritoryFileSchema>;
}) {
  const errors: string[] = [];
  const { ranks, org, members, territories, site } = data;

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

  // 3. 机构 id 唯一
  const orgIds = new Set<string>();
  for (const n of org.nodes) {
    if (orgIds.has(n.id)) errors.push(`org.json：「${n.id}」机构 id 重复`);
    orgIds.add(n.id);
  }

  // 4. 成员 id 唯一
  const memberIds = new Set<string>();
  for (const m of members.members) {
    if (memberIds.has(m.id)) {
      errors.push(`members.json：「${m.id}」成员 id 重复（URL 会撞车）`);
    }
    memberIds.add(m.id);
  }

  // 5. 成员的 rankId 外键必须存在
  for (const m of members.members) {
    const who = `members.json 的「${m.displayName || m.id}」`;
    if (!rankIds.has(m.rankId)) {
      errors.push(
        `${who}：职位 rankId "${m.rankId}" 不存在，可用值：${[...rankIds].join(' / ')}`
      );
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

  // 9. 机构树的根必须存在，且 parentId 必须指回已存在的机构
  if (!orgIds.has(org.rootId)) {
    errors.push(`org.json：rootId "${org.rootId}" 不在 nodes 里`);
  }
  for (const n of org.nodes) {
    if (n.parentId !== null && !orgIds.has(n.parentId)) {
      errors.push(`org.json 的「${n.name}」：parentId "${n.parentId}" 不存在`);
    }
  }

  // 10. 机构树的 holders 必须能解析成人（memberId 存在，或给出了 name）
  for (const n of org.nodes) {
    for (const h of n.holders) {
      if (h.memberId && !memberIds.has(h.memberId)) {
        errors.push(
          `org.json 的「${n.name}」：任职人 memberId "${h.memberId}" 不在 members.json 里`
        );
      }
      if (!h.memberId && !h.name) {
        errors.push(`org.json 的「${n.name}」：有一条任职记录既没有 memberId 也没有 name`);
      }
    }
  }

  // 11. 中央执行委员会名单里的人必须存在
  for (const g of org.presidium.groups) {
    for (const id of g.memberIds) {
      if (!memberIds.has(id)) {
        errors.push(`org.json 的中央执行委员会「${g.name}」：memberId "${id}" 不存在`);
      }
    }
  }

  // 12. 机构树不得成环
  const parentOf = new Map(org.nodes.map((n) => [n.id, n.parentId]));
  for (const n of org.nodes) {
    const seen = new Set<string>([n.id]);
    let cur = parentOf.get(n.id) ?? null;
    while (cur) {
      if (seen.has(cur)) {
        errors.push(`org.json 的「${n.name}」：parentId 链成环`);
        break;
      }
      seen.add(cur);
      cur = parentOf.get(cur) ?? null;
    }
  }

  // 13. 领地 id 唯一
  const territoryIds = new Set<string>();
  for (const t of territories.territories) {
    if (territoryIds.has(t.id)) {
      errors.push(`territories.json：「${t.id}」领地 id 重复`);
    }
    territoryIds.add(t.id);
  }

  // 14. 领地数量与 site.json 的总数口径一致
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

  // 15. 全社人数不得小于名录里的人数
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
const org = readJson('org.json', OrgFileSchema);
const members = readJson('members.json', MembersFileSchema);
const territories = readJson('territories.json', TerritoryFileSchema);

crossValidate({ site, ranks, org, members, territories });

/** 职位按 level 从高到低 */
export const rankList = [...ranks.ranks].sort((a, b) => b.level - a.level);
export const memberList = [...members.members].sort((a, b) => {
  const ra = rankList.findIndex((r) => r.id === a.rankId);
  const rb = rankList.findIndex((r) => r.id === b.rankId);
  if (ra !== rb) return ra - rb;
  return a.order - b.order;
});

export const rankMap = new Map(rankList.map((r) => [r.id, r]));
export const memberMap = new Map(memberList.map((m) => [m.id, m]));

export { site, ranks, org, members, territories };

/* ------------------------------------------------------------------ */
/* 机构树                                                              */
/* ------------------------------------------------------------------ */

export const orgNodeList = [...org.nodes].sort((a, b) => a.order - b.order);
export const orgNodeMap = new Map(orgNodeList.map((n) => [n.id, n]));
export const orgRoot = orgNodeMap.get(org.rootId)!;

/** 某机构的直接下级，按 order 排 */
export function orgChildren(parentId: string) {
  return orgNodeList.filter((n) => n.parentId === parentId);
}

/** 从根到该机构的路径（含自身） */
export function orgPath(id: string) {
  const chain = [];
  let cur = orgNodeMap.get(id);
  const guard = new Set<string>();
  while (cur && !guard.has(cur.id)) {
    guard.add(cur.id);
    chain.unshift(cur);
    cur = cur.parentId ? orgNodeMap.get(cur.parentId) : undefined;
  }
  return chain;
}

/** 该机构所属的一级分支（凛海局之下的大委员会） */
export function orgBranchOf(id: string) {
  const path = orgPath(id);
  return path[1] ?? path[0];
}

/** 机构层级的中文标签 */
export const orgKindLabel: Record<string, string> = {
  root: '凛海局',
  commission: '委员会',
  bureau: '部',
  corps: '兵团',
  division: '局',
  office: '处',
  district: '军区',
};

/** 某机构的直属下级数量（用于卡片上的“下辖 N 个机构”） */
export function orgChildCount(id: string) {
  return orgNodeList.filter((n) => n.parentId === id).length;
}

/** 把 holders 解析成「人 + 备注」；名册里没有的人只给 name */
export function orgHolders(nodeId: string) {
  const node = orgNodeMap.get(nodeId);
  if (!node) return [];
  return node.holders.map((h) => ({
    member: h.memberId ? memberMap.get(h.memberId) ?? null : null,
    name: h.memberId ? memberMap.get(h.memberId)?.displayName ?? h.memberId : h.name ?? '',
    label: h.label,
  }));
}

/** 某人担任的全部机构（按机构顺序） */
export function officesOf(memberId: string) {
  return orgNodeList.filter((n) => n.holders.some((h) => h.memberId === memberId));
}

/** 某机构的直属任职成员（不含下级机构的人） */
export function membersOfOrg(nodeId: string) {
  return orgHolders(nodeId)
    .map((h) => h.member)
    .filter((m): m is NonNullable<typeof m> => Boolean(m));
}

/** 整个机构子树（含自身）里的所有机构 */
export function orgSubtree(id: string) {
  const out = [];
  const walk = (nodeId: string) => {
    const node = orgNodeMap.get(nodeId);
    if (!node) return;
    out.push(node);
    for (const child of orgChildren(nodeId)) walk(child.id);
  };
  walk(id);
  return out;
}

/** 机构子树里的任职人数（去重，仅统计在名册里的成员） */
export function orgHeadcount(id: string) {
  const ids = new Set<string>();
  for (const node of orgSubtree(id)) {
    for (const h of node.holders) if (h.memberId) ids.add(h.memberId);
  }
  return ids.size;
}

/** 机构树嵌套结构，供递归渲染 */
export interface OrgTree {
  node: (typeof orgNodeList)[number];
  children: OrgTree[];
}
export function buildOrgTree(id: string): OrgTree {
  const node = orgNodeMap.get(id)!;
  return { node, children: orgChildren(id).map((c) => buildOrgTree(c.id)) };
}

/** 图中出现但名册里没有的人（按姓名列出，用于页脚说明） */
export const orgUnlistedNames = [
  ...new Set(
    orgNodeList.flatMap((n) => n.holders.filter((h) => !h.memberId && h.name).map((h) => h.name!))
  ),
];

/* ------------------------------------------------------------------ */
/* 领地层级                                                            */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* 成员分组                                                            */
/* ------------------------------------------------------------------ */

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

export const isPlaceholder = Boolean(
  members.isPlaceholder || ranks.isPlaceholder || org.isPlaceholder
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
  return mo ? `${y} 年 ${Number(mo)} 月` : `${y} 年`;
}

/** 2025-12-27 + 09:26 → 2025 年 12 月 27 日 09:26 */
export function formatDateFull(d: string, t = '') {
  if (!d) return '';
  const [y, mo, day] = d.split('-');
  if (!day) return formatMonth(d);
  const base = `${y} 年 ${Number(mo)} 月 ${Number(day)} 日`;
  return t ? `${base} ${t}` : base;
}

export const statusLabel: Record<string, string> = {
  active: '在任',
  reserve: '休假',
  honorary: '荣誉',
  left: '已离会',
};
