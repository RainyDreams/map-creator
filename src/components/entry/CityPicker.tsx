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
import { provinceOfCity } from '@/utils/geo'

interface CityPickerProps {
  /** 当前城市名（可不带“市”后缀），为空表示未选 */
  value: string
  onChange: (city: string) => void
  /** 降级为文本输入时透传回车键处理（最后一行回车加行） */
  onEnterKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  ariaLabel?: string
}

type Status = 'loading' | 'ready' | 'offline'

/** 去掉“市”后缀存储（与 geo.ts 的 provinceOfCity / inferCityFromUniversity 输出保持一致） */
function stripCitySuffix(name: string): string {
  return name.replace(/市$/, '')
}

/**
 * 省 → 市二级联动选择器。
 * - 数据来自 /api 城市服务（cities.ts）；服务不可用时降级为手动文本输入。
 * - value 变化（含大学失焦自动推断）时通过 provinceOfCity 反查省份并回显两个下拉。
 */
export default function CityPicker({ value, onChange, onEnterKeyDown, ariaLabel }: CityPickerProps) {
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
      if (list.length === 0 && isCityApiAvailable() === false) {
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
    const inferred = value.trim() ? provinceOfCity(value) : null
    if (inferred && inferred !== province) setProvince(inferred)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  // 省份变化 → 拉取该省城市（带序号防竞态）
  useEffect(() => {
    if (status !== 'ready' || !province) {
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
          placeholder="自动推断，可修改"
          aria-label={ariaLabel}
          className="h-9 border-stone-200 bg-white focus-visible:ring-amber-300"
        />
        <p className="flex items-center gap-1 text-[11px] text-stone-400">
          <WifiOff className="h-3 w-3 shrink-0" />
          城市数据服务未连接，可手动输入
        </p>
      </div>
    )
  }

  // —— 省份加载中 ——
  if (status === 'loading') {
    return (
      <div className="col-span-2 flex h-9 items-center gap-2 rounded-md border border-stone-200 bg-stone-50 px-3 text-xs text-stone-400">
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
      {/* 省份下拉 */}
      <Select value={province} onValueChange={handleProvinceChange}>
        <SelectTrigger
          aria-label={`${ariaLabel ?? ''}所在省份`}
          className="col-span-1 h-9 w-full border-stone-200 bg-white focus:ring-amber-300"
        >
          <SelectValue placeholder="省份" />
        </SelectTrigger>
        <SelectContent>
          {provinces.map((p) => (
            <SelectItem key={p} value={p}>
              {p}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* 城市下拉：Popover + Command，支持搜索过滤 */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label={ariaLabel ?? '城市'}
            disabled={!province}
            className={cn(
              'col-span-1 h-9 w-full justify-between border-stone-200 bg-white px-3 font-normal hover:bg-white',
              !value && 'text-muted-foreground',
            )}
          >
            <span className="truncate">
              {citiesLoading ? '加载中…' : value || (province ? '城市' : '先选省份')}
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
    </>
  )
}
