import { onRequestGet as __api_cities_ts_onRequestGet } from "G:\\Project\\map-creator\\app\\functions\\api\\cities.ts"
import { onRequestGet as __api_provinces_ts_onRequestGet } from "G:\\Project\\map-creator\\app\\functions\\api\\provinces.ts"

export const routes = [
    {
      routePath: "/api/cities",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_cities_ts_onRequestGet],
    },
  {
      routePath: "/api/provinces",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_provinces_ts_onRequestGet],
    },
  ]