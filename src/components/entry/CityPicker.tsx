import { useEffect, useRef, useState } from 'react'
import { Check, ChevronsUpDown, Loader2, WifiOff } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { cn } from '@/lib/utils'
import { fetchCities, fetchProvinces, isCityApiAvailable, type CityInfo } from '@/utils/cities'
import { normalizeProvinceName, provinceOfCity } from '@/utils/geo'

/** 省份全称 → 短名（湖南省→湖南、北京市→北京；只显示省份模式下作为城市位的存储值） */
function provinceShort(p: string): string {
  return p.replace(/(特别行政区|壮族自治区|回族自治区|维吾尔自治区|自治区|省|市)$/, '')
}

interface CityPickerProps {
  /** 当前城市名（可不带“市”后缀），为空表示未选；只显示省份模式下也可能是省份短名（如「湖南」） */
  value: string
  onChange: (city: string) => void
  /** 境外标记：true 时 value 视为国家/地区名，不在中国地图定位 */
  overseas?: boolean
  onOverseasChange?: (v: boolean) => void
  /** 只显示省份模式（v1.29.1）：城市可留空，只选省份时 value 存省份短名 */
  provinceOnly?: boolean
  /** 降级为文本输入时透传回车键处理（最后一行回车加行） */
  onEnterKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  ariaLabel?: string
}

type Status = 'loading' | 'ready' | 'offline'

/** 省份下拉里「海外 / 境外」选项的取值（不会与真实省份重名） */
const OVERSEAS_VALUE = '__overseas__'

/** 去掉“市”后缀存储（与 geo.ts 的 provinceOfCity / inferCityFromUniversity 输出保持一致） */
function stripCitySuffix(name: string): string {
  return name.replace(/市$/, '')
}

/**
 * 省 → 市二级联动选择器。
 * - 数据来自 /api 城市服务（cities.ts）；服务不可用时降级为手动文本输入。
 * - value 变化（含大学失焦自动推断）时通过 provinceOfCity 反查省份并回显两个下拉。
 * - 省份下拉首项为「海外 / 境外」：选中后城市位变为国家/地区自由输入，
 *   该同学不指向地图，单独列入「海外 / 境外」区块。
 */
export default function CityPicker({ value, onChange, overseas, onOverseasChange, provinceOnly, onEnterKeyDown, ariaLabel }: CityPickerProps) {
  const [status, setStatus] = useState<Status>('loading')
  const [provinces, setProvinces] = useState<string[]>([])
  const [province, setProvince] = useState('')
  const [cities, setCities] = useState<CityInfo[]>([])
  const [citiesLoading, setCitiesLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const cityFetchSeq = useRef(0)

  // 挂载时拉取省份列表；接口不可用 → 降级
  useEffect(() => {
    let cancelled = false
    fetchProvinces().then((list) => {
      if (cancelled) return
      // 接口失败（isCityApiAvailable() === false）或返回空省份列表（后端异常）都降级
      if (list.length === 0 || isCityApiAvailable() === false) {
        setStatus('offline')
      } else {
        setProvinces(list)
        setStatus('ready')
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  // 外部 value 变化（含自动推断、Excel 导入、示例数据）→ 反查省份回显
  useEffect(() => {
    if (overseas) {
      if (province !== OVERSEAS_VALUE) setProvince(OVERSEAS_VALUE)
      return
    }
    if (!value.trim()) return
    const inferred = provinceOfCity(value)
    if (inferred && inferred !== province) setProvince(inferred)
    // 只显示省份模式：value 是省份短名（如「湖南」）时，省份下拉也要回显
    if (!inferred && provinceOnly) {
      const asProv = normalizeProvinceName(value)
      if (asProv && asProv !== province) setProvince(asProv)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, overseas, provinceOnly])

  // 省份变化 → 拉取该省城市（带序号防竞态）；境外模式不拉取
  useEffect(() => {
    if (status !== 'ready' || !province || province === OVERSEAS_VALUE) {
      setCities([])
      return
    }
    const seq = ++cityFetchSeq.current
    setCitiesLoading(true)
    fetchCities(province).then((list) => {
      if (seq !== cityFetchSeq.current) return
      setCities(list)
      setCitiesLoading(false)
    })
  }, [province, status])

  const handleProvinceChange = (p: string) => {
    setProvince(p)
    if (p === OVERSEAS_VALUE) {
      onOverseasChange?.(true)
      // 切换为境外时，若当前值是国内城市则清空，请用户改写国家/地区
      if (value.trim() && provinceOfCity(value)) onChange('')
      return
    }
    onOverseasChange?.(false)
    if (provinceOnly) {
      // 只显示省份模式：选省份即先把城市位置为省份短名（用户可再选具体城市覆盖）；
      // 若当前值已是该省的城市或该省短名，保持不变
      const v = value.trim()
      if (v === '' || (provinceOfCity(v) !== p && provinceShort(p) !== v)) onChange(provinceShort(p))
      return
    }
    // 切换省份后，若当前城市不属于新省份则清空，避免“河北省 + 广州”这种错配
    if (value.trim() && provinceOfCity(value) !== p) onChange('')
  }

  const handleCitySelect = (cityName: string) => {
    onChange(stripCitySuffix(cityName))
    setOpen(false)
  }

  // —— 降级：接口不可用，退回手动输入 ——
  if (status === 'offline') {
    return (
      <div className="col-span-2 space-y-1">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onEnterKeyDown}
          placeholder={overseas ? '国家 / 地区，如：美国' : '自动推断，可修改'}
          aria-label={ariaLabel}
          className="h-8 border-stone-200 bg-white text-xs focus-visible:ring-stone-300 md:h-9 md:text-sm"
        />
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1 text-[11px] text-stone-400">
            <WifiOff className="h-3 w-3 shrink-0" />
            城市数据服务未连接，可手动输入
          </p>
          <label className="flex cursor-pointer items-center gap-1 text-[11px] text-stone-500">
            <input
              type="checkbox"
              checked={overseas === true}
              onChange={(e) => onOverseasChange?.(e.target.checked)}
              className="h-3 w-3 accent-stone-600"
            />
            境外
          </label>
        </div>
      </div>
    )
  }

  // —— 省份加载中 ——
  if (status === 'loading') {
    return (
      <div className="col-span-2 flex h-8 items-center gap-2 rounded-md border border-stone-200 bg-stone-50 px-3 text-xs text-stone-400 md:h-9">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        城市数据加载中…
      </div>
    )
  }

  // 当前选中城市在下拉列表里的完整名（用于高亮勾选）
  const matchedCity = cities.find(
    (c) => c.name === value || stripCitySuffix(c.name) === value,
  )

  return (
    <>
      {/* 省份下拉（首项为「海外 / 境外」） */}
      <Select value={province} onValueChange={handleProvinceChange}>
        <SelectTrigger
          aria-label={`${ariaLabel ?? ''}所在省份`}
          className="col-span-1 h-8 w-full min-w-0 border-stone-200 bg-white text-xs focus:ring-stone-300 md:h-9 md:text-sm [&>span]:truncate"
        >
          <SelectValue placeholder="省份" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={OVERSEAS_VALUE}>海外 / 境外</SelectItem>
          {provinces.map((p) => (
            <SelectItem key={p} value={p}>
              {p}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* 境外：国家/地区自由输入；境内：城市下拉（Popover + Command，支持搜索过滤） */}
      {overseas === true ? (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onEnterKeyDown}
          placeholder="国家 / 地区，如：美国"
          aria-label={`${ariaLabel ?? ''}国家或地区`}
          className="col-span-1 h-8 border-stone-200 bg-white text-xs focus-visible:ring-stone-300 md:h-9 md:text-sm"
        />
      ) : (
      <Popover open={open} onOpenChange={setOpen} modal>
        {/* modal：本组件常驻模态框（Dialog）内，Dialog 的滚动锁会拦截 portal 到 body 的
            Popover 内容滚轮；modal 让 Popover 自建滚动作用域，城市列表滚轮恢复正常 */}
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label={ariaLabel ?? '城市'}
            disabled={!province}
            className={cn(
              'col-span-1 h-8 w-full min-w-0 justify-between border-stone-200 bg-white px-2.5 text-xs font-normal hover:bg-white md:h-9 md:px-3 md:text-sm',
              !value && 'text-muted-foreground',
            )}
          >
            <span className="truncate">
              {citiesLoading ? '加载中…' : value || (province ? (provinceOnly ? '城市（可留空）' : '城市') : '先选省份')}
            </span>
            {citiesLoading ? (
              <Loader2 className="ml-1 h-3.5 w-3.5 shrink-0 animate-spin opacity-60" />
            ) : (
              <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] min-w-40 p-0" align="start">
          <Command>
            <CommandInput placeholder="搜索城市…" />
            <CommandList>
              <CommandEmpty>未找到匹配城市</CommandEmpty>
              <CommandGroup>
                {/* 只显示省份模式：允许不选具体城市，城市位存省份短名 */}
                {provinceOnly && province && (
                  <CommandItem
                    value={`__only_province__${province}`}
                    onSelect={() => {
                      onChange(provinceShort(province))
                      setOpen(false)
                    }}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        value.trim() === provinceShort(province) ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    仅到省（不选具体城市）
                  </CommandItem>
                )}
                {cities.map((c) => (
                  <CommandItem
                    key={c.name}
                    value={c.name}
                    onSelect={() => handleCitySelect(c.name)}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        matchedCity?.name === c.name ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    {c.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      )}
    </>
  )
}
