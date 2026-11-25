import { z } from 'zod';

/** 状态枚举：在任 / 休假 / 荣誉 / 已离会 */
export const StatusSchema = z.enum(['active', 'reserve', 'honorary', 'left']);

/** 职级所属线：党务行政 / 苏维埃 / 武装 */
export const TrackSchema = z.enum(['party', 'soviet', 'army']);

const id = z.string().regex(/^[a-z0-9-]+$/, 'id 只能是小写英文、数字和短横线');

export const RankSchema = z.object({
  id,
  name: z.string().min(1, '职级名称不能为空'),
  track: TrackSchema.default('party'),
  grade: z.string().default(''),
  level: z.number().int('层级必须是整数'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, '颜色必须是 #RRGGBB 格式'),
  summary: z.string().default(''),
  duties: z.array(z.string()).default([]),
  promotion: z.string().default(''),
  limit: z.number().int().nullable().default(null),
});

export const RankFileSchema = z.object({
  isPlaceholder: z.boolean().default(false),
  ranks: z.array(RankSchema),
});

/** 职务（横向职能分工）：牵头机构用 orgIds 外键，负责人由 appointments 体现 */
export const PortfolioSchema = z.object({
  id,
  name: z.string().min(1),
  icon: z.string().default(''),
  description: z.string().default(''),
  /** 牵头机构外键（对照 organizations.json 真实 id） */
  orgIds: z.array(z.string()).default([]),
});

export const PortfoliosFileSchema = z.object({
  isPlaceholder: z.boolean().default(false),
  portfolios: z.array(PortfolioSchema),
});

/** 任职：成员在某个机构（org）或地名（place）上的一段任职关系 */
export const AppointmentSchema = z.object({
  /** 'org' = 机构节点，'place' = 地名节点 */
  node: z.enum(['org', 'place']),
  /** 对应 organizations.json / places.json 的节点 id */
  id,
  /** 岗位：负责人 / 副职 / 普通成员 */
  post: z.enum(['head', 'deputy', 'member']),
});

export const MemberSchema = z.object({
  id,
  gameId: z.string().min(1, '游戏 ID 不能为空'),
  displayName: z.string().min(1, '展示名不能为空'),
  /** 称号 / 头衔 */
  honorific: z.string().default(''),
  rankId: z.string().min(1, '必须填写职级'),
  /** 职务（横向职能）外键 */
  portfolioIds: z.array(z.string()).default([]),
  status: StatusSchema,
  leftAt: z
    .string()
    .regex(/^\d{4}(-\d{2})?$/)
    .nullable()
    .default(null),
  /** 简介可为空：实名名册只保证 ID 与职级时，不编造个人经历 */
  intro: z.string().max(400, '简介最多 400 字').default(''),
  tags: z.array(z.string()).max(5, '擅长标签最多 5 个').default([]),
  featured: z.boolean().default(false),
  order: z.number().default(100),
  updatedAt: z.string().default(''),
  /** 统一任职：取代旧的 orgIds / regionIds / headMemberIds 双记 */
  appointments: z.array(AppointmentSchema).default([]),
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

/** 机构节点：只存树结构，成员与负责人由 members.appointments 派生 */
export const OrganizationSchema = z.object({
  id,
  name: z.string().min(1, '机构名称不能为空'),
  tier: OrgTierSchema,
  /** 上级机构 id，根节点为 null */
  parentId: z.string().nullable(),
  /** 同级排序 */
  order: z.number().int().default(0),
  summary: z.string().default(''),
});

export const OrganizationFileSchema = z.object({
  isPlaceholder: z.boolean().default(false),
  organizations: z.array(OrganizationSchema),
});

/** 地名行政级别：联盟 / 凛海局 / 中央执行委员会 / 地区苏维埃 / 公社 / 聚落点 */
export const PlaceTierSchema = z.enum([
  'union',
  'bureau',
  'executive',
  'region',
  'commune',
  'locality',
]);

/** 聚落规模（原领地 tier）：首都 / 都市圈 / 城市 / 领地 / 省份 / 城镇 / 村庄 / 定居点 */
export const SettlementTierSchema = z.enum([
  'capital',
  'metro',
  'city',
  'territory',
  'province',
  'town',
  'village',
  'settlement',
]);

/** 地名节点：合并原 regions（行政）与 territories（聚落规模）为单一地名树 */
export const PlaceSchema = z.object({
  id,
  name: z.string().min(1, '名称不能为空'),
  /** 行政级别（regions 侧）；territory 独有聚落点为 'locality' */
  tier: PlaceTierSchema,
  /** 上级地名 id，根/聚落点为 null */
  parentId: z.string().nullable(),
  /** 聚落规模（territories 侧）；region 独有地名为 null */
  settlement: SettlementTierSchema.nullable().default(null),
  note: z.string().default(''),
  summary: z.string().default(''),
});

export const PlaceFileSchema = z.object({
  isPlaceholder: z.boolean().default(false),
  /** 已规划但尚未下发的数量 */
  pendingCount: z.number().int().default(0),
  places: z.array(PlaceSchema),
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
  /** 首府地名外键（places.json 的 id） */
  capitalPlaceId: id.default(''),
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

/** 地区介绍 / 奇观：富文本块 */
export const LoreBlockSchema = z.object({
  type: z.enum(['para', 'bullets', 'quote', 'sub']),
  title: z.string().default(''),
  body: z.string().default(''),
  items: z.array(z.string()).default([]),
});

export const LoreSectionSchema = z.object({
  title: z.string().min(1),
  blocks: z.array(LoreBlockSchema).default([]),
});

export const LoreWonderSchema = z.object({
  id,
  name: z.string().min(1),
  kind: z.string().default(''),
  location: z.string().default(''),
  summary: z.string().default(''),
  source: z.string().default(''),
  sourceUrl: z.string().default(''),
  sections: z.array(LoreSectionSchema).default([]),
});

/** 地区介绍：id 为 places.json 的地名外键 */
export const LoreRegionSchema = z.object({
  id,
  name: z.string().min(1),
  area: z.string().default(''),
  summary: z.string().default(''),
  source: z.string().default(''),
  sourceUrl: z.string().default(''),
  wonders: z.array(LoreWonderSchema).default([]),
});

export const LoreFileSchema = z.object({
  isPlaceholder: z.boolean().default(false),
  note: z.string().default(''),
  regions: z.array(LoreRegionSchema).default([]),
});
