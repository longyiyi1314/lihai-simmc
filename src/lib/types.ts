import type { z } from 'zod';
import type {
  MemberSchema,
  RankSchema,
  PortfolioSchema,
  SiteSchema,
  OrganizationSchema,
  OrganizationFileSchema,
  PlaceSchema,
  PlaceFileSchema,
  AppointmentSchema,
} from './schema';

/** 数据层类型：统一从 zod schema 推导，避免页面里手写重复结构 */

export type Rank = z.infer<typeof RankSchema>;
export type Portfolio = z.infer<typeof PortfolioSchema>;
export type Appointment = z.infer<typeof AppointmentSchema>;

/** 职务（旧名 Role 保留为别名，Phase A 迁移组件后删除） */
export type Role = Portfolio;

type RawMember = z.infer<typeof MemberSchema>;
/** 成员视图：新字段 + 兼容视图字段（title/roleIds 等，Phase A 移除） */
export type Member = RawMember & {
  roleIds: string[];
  title: string;
  avatar: string;
  joinedAt: string;
  contacts: Record<string, string>;
};

type RawOrg = z.infer<typeof OrganizationSchema>;
/** 机构视图：纯树 + 派生成员列表 */
export type Organization = RawOrg & { memberIds: string[]; headMemberIds: string[] };
export type OrganizationFile = z.infer<typeof OrganizationFileSchema>;

type RawPlace = z.infer<typeof PlaceSchema>;
/** 地名视图：合并树 + 派生成员列表 */
export type Place = RawPlace & { memberIds: string[]; headMemberIds: string[] };
export type PlaceFile = z.infer<typeof PlaceFileSchema>;

type RawSite = z.infer<typeof SiteSchema>;
/** 站点视图：含派生显示值（首府名 / 领地计数） */
export type Site = RawSite & {
  capital: string;
  capitalPlaceId: string;
  territoryGranted: number;
  territoryTotal: number;
};
