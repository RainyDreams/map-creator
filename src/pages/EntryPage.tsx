import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { RotateCcw, Sparkles } from 'lucide-react'
import { useMapData } from '@/store/MapDataContext'
import { breadcrumb } from '@/utils/sessionLog'
import DataToolbar from '@/components/entry/DataToolbar'
import { CanvasManager } from '@/components/entry/CanvasManager'
import MetaForm from '@/components/entry/MetaForm'
import StudentTable from '@/components/entry/StudentTable'
import TeacherTable from '@/components/entry/TeacherTable'
import ThemePicker from '@/components/theme/ThemePicker'
import { FontPanel } from '@/components/entry/FontPanel'

/**
 * 录入页容器：垂直滚动布局。
 * 桌面端位于 420px 左侧栏，手机端整页；所有编辑实时写入 store，地图页联动。
 */
export default function EntryPage() {
  const { resetData } = useMapData()

  return (
    <div className="h-full overflow-y-auto bg-stone-50">
      <div className="mx-auto w-full max-w-md space-y-3 px-3 py-4 md:space-y-4 md:px-4 md:py-5">
        {/* 页头（右侧预留折叠按钮空间） */}
        <header className="space-y-1 pr-9">
          <h1 className="text-base font-bold text-stone-800 md:text-lg">蹭饭图 · 名单录入</h1>
          <p className="flex items-center gap-1.5 text-xs text-stone-500">
            <Sparkles className="h-3.5 w-3.5 text-stone-400" />
            手动录入或下载 Excel 模板批量填写，地图会实时联动
          </p>
        </header>

        {/* 顶部工具条：画布管理 + Excel 导入导出 + 清空 */}
        <div className="flex flex-wrap items-center gap-2">
          <CanvasManager />
          <DataToolbar />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 border-stone-200 text-xs text-stone-500 hover:bg-red-50 hover:text-red-600 md:text-sm"
              >
                <RotateCcw className="h-4 w-4" />
                清空
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="rounded-xl">
              <AlertDialogHeader>
                <AlertDialogTitle>确定要清空全部内容吗？</AlertDialogTitle>
                <AlertDialogDescription>
                  当前录入的标题、学生与老师名单都会被清除，页面恢复为空白。此操作不可撤销。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    breadcrumb('数据：清空全部内容（标题 + 学生 + 老师）')
                    resetData()
                  }}
                  className="bg-red-500 text-white hover:bg-red-600"
                >
                  确定清空
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <Separator />

        {/* 分组小标题：内容录入（班级信息 → 学生 → 老师，按填写顺序排列） */}
        <p className="px-1 pt-1 text-[11px] font-medium tracking-wide text-stone-400">内容</p>
        <MetaForm />
        <StudentTable />
        <TeacherTable />

        {/* 分组小标题：外观设计（主题风格 → 排版细节，从粗到细） */}
        <p className="px-1 pt-2 text-[11px] font-medium tracking-wide text-stone-400">外观</p>
        <ThemePicker />
        <FontPanel />

        <p className="pb-2 text-center text-xs text-stone-400">
          所有内容自动保存在本机浏览器，刷新不丢失
        </p>
      </div>
    </div>
  )
}
