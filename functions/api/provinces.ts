/**
 * GET /api/provinces → { "provinces": string[] }
 * 省份全称列表（与 src/assets/china.json 的 properties.name 一致）。
 */
import citiesData from './_data/cities.json'

const provinces = Object.keys(citiesData)

export const onRequestGet = (): Response => {
  return Response.json(
    { provinces },
    {
      headers: {
        'Cache-Control': 'public, max-age=86400',
      },
    },
  )
}
