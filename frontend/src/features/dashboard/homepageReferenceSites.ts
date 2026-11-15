// Dashboard display snapshot from backend/app/db/seed.py at 5ed7454.
// Never used for scientific calculations or instead of an available API catalog.
// IDs, names and east-positive MOON_ME reference coordinates are unchanged.
import type { LandingSite } from '@/types/api'

export const HOMEPAGE_REFERENCE_SITES: Pick<LandingSite,
  'id' | 'name' | 'latitude_deg' | 'longitude_deg'>[] = [
  { id: 'shackleton-rim-a', name: 'Shackleton Rim — Point A', latitude_deg: -89.68, longitude_deg: -166 },
  { id: 'connecting-ridge-b', name: 'Shackleton–de Gerlache Ridge — Point B', latitude_deg: -89.44, longitude_deg: -141.8 },
  { id: 'shackleton-floor', name: 'Shackleton Crater (center)', latitude_deg: -89.67, longitude_deg: 129.78 },
  { id: 'de-gerlache', name: 'de Gerlache Crater (center)', latitude_deg: -88.5, longitude_deg: -87.1 },
  { id: 'malapert-massif', name: 'Malapert Massif (approx.)', latitude_deg: -86, longitude_deg: 2.9 },
  { id: 'nobile', name: 'Nobile Crater (center)', latitude_deg: -85.2, longitude_deg: 53.5 },
  { id: 'bussey-2010-point-c', name: 'Bussey 2010 Point C — de Gerlache rim', latitude_deg: -88.71, longitude_deg: -68.7 },
  { id: 'bussey-2010-point-d', name: 'Bussey 2010 Point D — Shackleton ridge (most lit in 2020 map)', latitude_deg: -88.74, longitude_deg: 124.5 },
]
