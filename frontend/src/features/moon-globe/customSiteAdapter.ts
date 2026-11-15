import type { LandingSite } from '@/types/api'
import type { CustomSite } from '@/stores/missionStore'

/** Adapt a browser-persisted custom site to the Moon SitePanel / SiteCard contract. */
export function customAsLandingSite(c: CustomSite): LandingSite {
  return {
    id: c.id,
    name: c.name,
    latitude_deg: c.latitude_deg,
    longitude_deg: c.longitude_deg,
    region: 'Custom',
    description: '',
    coordinate_source: 'User-selected on 3D Moon (planetocentric MOON_ME via verified model axes; browser localStorage)',
    coordinate_status: 'USER_DEFINED',
  }
}
