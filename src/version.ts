import pkg from '../package.json'

/** 软件版本号（唯一来源：package.json 的 version 字段）。
    页脚版本号、「关于」页、画布 footer 右下角均引用此处，发版只需改 package.json + 更新日志 */
export const APP_VERSION = pkg.version as string
