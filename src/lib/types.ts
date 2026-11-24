import type { z } from 'zod';
import type {
  MemberSchema,
  RankSchema,
  RolesFileSchema,
  SiteSchema,
  OrganizationSchema,
  OrganizationFileSchema,
  RegionSchema,
  RegionFileSchema,
} from './schema';

/** 数据层类型：统一从 zod schema 推导，避免页面里手写重复结构 */
export type Member = z.infer<typeof MemberSchema>;
export type Rank = z.infer<typeof RankSchema>;
export type Role = z.infer<typeof RolesFileSchema>['roles'][number];
export type Site = z.infer<typeof SiteSchema>;
export type Organization = z.infer<typeof OrganizationSchema>;
export type OrganizationFile = z.infer<typeof OrganizationFileSchema>;
export type Region = z.infer<typeof RegionSchema>;
export type RegionFile = z.infer<typeof RegionFileSchema>;
