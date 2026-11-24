import { z } from 'zod';

/** 状态枚举：在任 / 休假 / 荣誉 / 已离会 */
export const StatusSchema = z.enum(['active', 'reserve', 'honorary', 'left']);

export const RankSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'id 只能是小写英文、数字和短横线'),
  name: z.string().min(1, '职位名称不能为空'),
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
  status: StatusSchema,
  joinedAt: z.string().regex(/^\d{4}-\d{2}$/, '加入时间格式必须是 YYYY-MM'),
  leftAt: z.string().regex(/^\d{4}(-\d{2})?$/).nullable().default(null),
  avatar: z.string().default(''),
  intro: z.string().min(10, '简介至少 10 个字').max(400, '简介最多 400 字'),
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

export const AnnouncementSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  text: z.string().min(1),
});

export const SiteSchema = z.object({
  nationName: z.string().min(1),
  nationNameEn: z.string().default(''),
  game: z.string().default('Minecraft'),
  server: z.string().default(''),
  version: z.string().default(''),
  foundedAt: z.string().default(''),
  motto: z.string().default(''),
  summary: z.string().default(''),
  emblem: z.string().default(''),
  banner: z.string().default(''),
  links: z
    .array(z.object({ label: z.string(), url: z.string() }))
    .default([]),
  recruiting: z.boolean().default(false),
  isPlaceholder: z.boolean().default(false),
  announcements: z.array(AnnouncementSchema).default([]),
});
