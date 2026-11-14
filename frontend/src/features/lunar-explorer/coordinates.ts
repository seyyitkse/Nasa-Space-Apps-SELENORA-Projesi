/** Values are i18n keys under `explorer.errors`. */
export interface CoordinateErrors {
  lat?: 'lat'
  lon?: 'lon'
  name?: 'name'
}

/** Validate free-text coordinate input. Returns parsed values or keyed errors. */
export function parseCoordinates(input: { lat: string; lon: string; name: string }):
  | { ok: true; lat: number; lon: number; name: string }
  | { ok: false; errors: CoordinateErrors } {
  const errors: CoordinateErrors = {}
  const lat = Number(input.lat.replace(',', '.'))
  const lon = Number(input.lon.replace(',', '.'))
  if (input.lat.trim() === '' || !Number.isFinite(lat) || lat < -90 || lat > 90) {
    errors.lat = 'lat'
  }
  if (input.lon.trim() === '' || !Number.isFinite(lon) || lon < -180 || lon > 180) {
    errors.lon = 'lon'
  }
  const name = input.name.trim()
  if (name.length < 1 || name.length > 80) errors.name = 'name'
  if (Object.keys(errors).length) return { ok: false, errors }
  return { ok: true, lat, lon, name }
}
