import type { z } from 'zod';
import type {
  MemberSchema,
  RankSchema,
  RolesFileSchema,
  SiteSchema,
} from './schema';

/** 数据层类型：统一从 zod schema 推导，避免页面里手写重复结构 */
export type Member = z.infer<typeof MemberSchema>;
export type Rank = z.infer<typeof RankSchema>;
export type Role = z.infer<typeof RolesFileSchema>['roles'][number];
export type Site = z.infer<typeof SiteSchema>;
