import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { z } from 'zod';
import {
  SiteSchema,
  RankFileSchema,
  RolesFileSchema,
  MembersFileSchema,
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
}) {
  const errors: string[] = [];
  const { ranks, roles, members } = data;

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

crossValidate({ site, ranks, roles, members });

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

export { site, ranks, roles, members };

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
export function membersOfRole(roleId: string) {
  return activeMembers.filter((m) => m.roleIds.includes(roleId));
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
  return mo ? `${y} 年 ${Number(mo)} 月` : `${y} 年`;
}

export const statusLabel: Record<string, string> = {
  active: '在任',
  reserve: '休假',
  honorary: '荣誉',
  left: '已离会',
};
