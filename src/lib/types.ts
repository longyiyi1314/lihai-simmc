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

/** 成员视图：zod schema 推导（honorific/portfolioIds/appointments） */
export type Member = z.infer<typeof MemberSchema>;

export type Organization = z.infer<typeof OrganizationSchema>;
export type OrganizationFile = z.infer<typeof OrganizationFileSchema>;

export type Place = z.infer<typeof PlaceSchema>;
export type PlaceFile = z.infer<typeof PlaceFileSchema>;

type RawSite = z.infer<typeof SiteSchema>;
/** 站点视图：含派生显示值（首府名 / 领地计数） */
export type Site = RawSite & {
  capital: string;
  capitalPlaceId: string;
  territoryGranted: number;
  territoryTotal: number;
};
