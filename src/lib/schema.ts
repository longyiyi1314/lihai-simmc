import { z } from 'zod';

/** 状态枚举：在任 / 休假 / 荣誉 / 已离会 */
export const StatusSchema = z.enum(['active', 'reserve', 'honorary', 'left']);

/** 职级所属线：党务行政 / 苏维埃 / 武装 */
export const TrackSchema = z.enum(['party', 'soviet', 'army']);

export const RankSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'id 只能是小写英文、数字和短横线'),
  name: z.string().min(1, '职位名称不能为空'),
  track: TrackSchema.default('party'),
  grade: z.string().default(''),
  level: z.number().int('层级必须是整数'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, '颜色必须是 #RRGGBB 格式'),
  summary: z.string().default(''),
  duties: z.array(z.string()).default([]),
  promotion: z.string().default(''),
  limit: z.number().int().nullable().default(null),
});

export const RolesFileSchema = z.object({
  isPlaceholder: z.boolean().default(false),
  roles: z.array(
    z.object({
      id: z.string().regex(/^[a-z0-9-]+$/),
      name: z.string().min(1),
      icon: z.string().default(''),
      description: z.string().default(''),
      leadMemberId: z.string().nullable().default(null),
    })
  ),
});

export const RankFileSchema = z.object({
  isPlaceholder: z.boolean().default(false),
  ranks: z.array(RankSchema),
});

export const MemberSchema = z.object({
  id: z
    .string()
    .regex(/^[a-z0-9-]+$/, 'id（URL slug）只能是小写英文、数字和短横线'),
  gameId: z.string().min(1, '游戏 ID 不能为空'),
  displayName: z.string().min(1, '展示名不能为空'),
  title: z.string().default(''),
  rankId: z.string().min(1, '必须填写职位'),
  roleIds: z.array(z.string()).default([]),
  /** 任职机构（纵向部门树），与横向职能 roleIds 相互独立 */
  orgIds: z.array(z.string()).default([]),
  /** 任职地区/公社（行政区划树），与部门树 orgIds 相互独立 */
  regionIds: z.array(z.string()).default([]),
  status: StatusSchema,
  /** 加入时间，允许留空（真实名册里往往无法逐人考证） */
  joinedAt: z
    .string()
    .regex(/^\d{4}-\d{2}$/, '加入时间格式必须是 YYYY-MM')
    .or(z.literal(''))
    .default(''),
  leftAt: z
    .string()
    .regex(/^\d{4}(-\d{2})?$/)
    .nullable()
    .default(null),
  avatar: z.string().default(''),
  /** 简介可为空：实名名册只保证 ID 与职级时，不编造个人经历 */
  intro: z.string().max(400, '简介最多 400 字').default(''),
  tags: z.array(z.string()).max(5, '擅长标签最多 5 个').default([]),
  contacts: z
    .object({
      bilibili: z.string().optional(),
      discord: z.string().optional(),
      qq: z.string().optional(),
    })
    .default({}),
  featured: z.boolean().default(false),
  order: z.number().default(100),
  updatedAt: z.string().default(''),
});

export const MembersFileSchema = z.object({
  isPlaceholder: z.boolean().default(false),
  members: z.array(MemberSchema),
});

/** 机构等级：根 / 委员会 / 部 / 局 / 处 / 军队单位 */
export const OrgTierSchema = z.enum([
  'root',
  'committee',
  'department',
  'bureau',
  'division',
  'unit',
]);

export const OrganizationSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, '机构 id 只能是小写英文、数字和短横线'),
  name: z.string().min(1, '机构名称不能为空'),
  tier: OrgTierSchema,
  /** 上级机构 id，根节点为 null */
  parentId: z.string().nullable(),
  /** 负责人（可多人或暂缺） */
  headMemberIds: z.array(z.string()).default([]),
  /** 在该机构任职的全部成员（含负责人） */
  memberIds: z.array(z.string()).default([]),
  summary: z.string().default(''),
});

export const OrganizationFileSchema = z.object({
  isPlaceholder: z.boolean().default(false),
  organizations: z.array(OrganizationSchema),
});

/** 行政区划层级：联盟 / 凛海局 / 凛海局 / 中央执行委员会 / 地区苏维埃 / 公社 */
export const RegionTierSchema = z.enum([
  'union',
  'bureau',
  'executive',
  'region',
  'commune',
]);

export const RegionSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, '节点 id 只能是小写英文、数字和短横线'),
  name: z.string().min(1, '名称不能为空'),
  tier: RegionTierSchema,
  /** 上级节点 id，根节点为 null */
  parentId: z.string().nullable(),
  /** 负责人（主任/公社代表，可多人或暂缺） */
  headMemberIds: z.array(z.string()).default([]),
  /** 在该节点任职的全部成员（含负责人） */
  memberIds: z.array(z.string()).default([]),
  summary: z.string().default(''),
});

export const RegionFileSchema = z.object({
  isPlaceholder: z.boolean().default(false),
  regions: z.array(RegionSchema),
});

/** 领地层级：首都 / 都市圈 / 城市 / 领地 / 省份 / 城镇 / 村庄 / 定居点 */
export const TerritoryTierSchema = z.enum([
  'capital',
  'metro',
  'city',
  'territory',
  'province',
  'town',
  'village',
  'settlement',
]);

export const TerritorySchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  tier: TerritoryTierSchema,
  note: z.string().default(''),
});

export const TerritoryFileSchema = z.object({
  isPlaceholder: z.boolean().default(false),
  /** 已下发领地 */
  territories: z.array(TerritorySchema),
  /** 已规划但尚未下发的数量 */
  pendingCount: z.number().int().default(0),
});

export const AnnouncementSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  text: z.string().min(1),
});

export const HolidaySchema = z.object({
  name: z.string().min(1),
  date: z.string().regex(/^\d{2}-\d{2}$/),
});

export const SiteSchema = z.object({
  nationName: z.string().min(1),
  fullName: z.string().default(''),
  nationNameEn: z.string().default(''),
  fullNameEn: z.string().default(''),
  clubName: z.string().default(''),
  studioName: z.string().default(''),
  game: z.string().default('Minecraft'),
  server: z.string().default(''),
  version: z.string().default(''),
  foundedAt: z.string().default(''),
  foundedTime: z.string().default(''),
  motto: z.string().default(''),
  summary: z.string().default(''),
  capital: z.string().default(''),
  government: z.string().default(''),
  ideology: z.string().default(''),
  pact: z.string().default(''),
  peoples: z.string().default(''),
  languages: z.array(z.string()).default([]),
  holidays: z.array(HolidaySchema).default([]),
  /** 全社在册人数（名册只逐人收录了其中一部分） */
  memberTotal: z.number().int().default(0),
  /** 领土区块总数，仅用于文案 */
  chunkTotal: z.number().int().default(0),
  territoryTotal: z.number().int().default(0),
  territoryGranted: z.number().int().default(0),
  emblem: z.string().default(''),
  banner: z.string().default(''),
  links: z
    .array(z.object({ label: z.string(), url: z.string() }))
    .default([]),
  contacts: z
    .object({
      clubGroup: z.string().optional(),
      serviceGroup: z.string().optional(),
      email: z.string().optional(),
      bilibili: z.string().optional(),
    })
    .default({}),
  slogan: z.string().default(''),
  recruiting: z.boolean().default(false),
  isPlaceholder: z.boolean().default(false),
  announcements: z.array(AnnouncementSchema).default([]),
});
