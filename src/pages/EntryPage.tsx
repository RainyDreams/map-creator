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
import ExcelToolbar from '@/components/entry/ExcelToolbar'
import MetaForm from '@/components/entry/MetaForm'
import StudentTable from '@/components/entry/StudentTable'
import TeacherTable from '@/components/entry/TeacherTable'

/**
 * 录入页容器：垂直滚动布局。
 * 桌面端位于 420px 左侧栏，手机端整页；所有编辑实时写入 store，地图页联动。
 */
export default function EntryPage() {
  const { resetData } = useMapData()

  return (
    <div className="h-full overflow-y-auto bg-amber-50/40">
      <div className="mx-auto w-full max-w-md space-y-4 px-4 py-5">
        {/* 页头 */}
        <header className="space-y-1">
          <h1 className="text-lg font-bold text-stone-800">蹭饭图 · 名单录入</h1>
          <p className="flex items-center gap-1.5 text-xs text-stone-500">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            手动录入或下载 Excel 模板批量填写，地图会实时联动
          </p>
        </header>

        {/* 顶部工具条：Excel 导入导出 + 清空重置 */}
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <ExcelToolbar />
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 border-stone-200 text-stone-500 hover:bg-red-50 hover:text-red-600"
              >
                <RotateCcw className="h-4 w-4" />
                清空重置
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="rounded-xl">
              <AlertDialogHeader>
                <AlertDialogTitle>确定要清空重置吗？</AlertDialogTitle>
                <AlertDialogDescription>
                  当前录入的标题、学生与老师名单都会被清除，并恢复为示例数据。此操作不可撤销。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction
                  onClick={resetData}
                  className="bg-red-500 text-white hover:bg-red-600"
                >
                  确定清空
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <Separator className="bg-amber-200/60" />

        <MetaForm />
        <StudentTable />
        <TeacherTable />

        <p className="pb-2 text-center text-xs text-stone-400">
          所有内容自动保存在本机浏览器，刷新不丢失
        </p>
      </div>
    </div>
  )
}
