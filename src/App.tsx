import { Suspense, lazy } from 'react'
import { Camera, Users, DollarSign, BarChart2, ClipboardList } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

const CaptureTab = lazy(() => import('@/features/CaptureTab'))
const PeopleTab = lazy(() => import('@/features/PeopleTab'))
const AttendanceTab = lazy(() => import('@/features/AttendanceTab'))
const SalaryTab = lazy(() => import('@/features/SalaryTab'))
const AnalyticsTab = lazy(() => import('@/features/AnalyticsTab'))

function TabFallback() {
  return (
    <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
      Loading...
    </div>
  )
}

export default function App() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-4">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Salary Manager
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Autonomous Attendance System
          </p>
        </header>

        <Tabs defaultValue="capture">
          <TabsList className="mb-4 w-full">
            <TabsTrigger value="capture" className="flex items-center gap-2">
              <Camera className="h-4 w-4" />
              Capture
            </TabsTrigger>
            <TabsTrigger value="people" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              People
            </TabsTrigger>
            <TabsTrigger value="attendance" className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              Attendance
            </TabsTrigger>
            <TabsTrigger value="salary" className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Salary
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-2">
              <BarChart2 className="h-4 w-4" />
              Analytics
            </TabsTrigger>
          </TabsList>

          <TabsContent value="capture">
            <Suspense fallback={<TabFallback />}>
              <CaptureTab />
            </Suspense>
          </TabsContent>

          <TabsContent value="people">
            <Suspense fallback={<TabFallback />}>
              <PeopleTab />
            </Suspense>
          </TabsContent>

          <TabsContent value="attendance">
            <Suspense fallback={<TabFallback />}>
              <AttendanceTab />
            </Suspense>
          </TabsContent>

          <TabsContent value="salary">
            <Suspense fallback={<TabFallback />}>
              <SalaryTab />
            </Suspense>
          </TabsContent>

          <TabsContent value="analytics">
            <Suspense fallback={<TabFallback />}>
              <AnalyticsTab />
            </Suspense>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
