import './globals.css'
import Navbar from '@/components/Navbar'

export const metadata = {
  title: '鸿蒙计划 · RPS',
  description: '绕月轨道超长波天文台研究提案申请与评审系统',
}

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen antialiased">
        <Navbar />
        <main className="min-h-screen min-w-0 px-4 pb-10 pt-20 sm:px-6 lg:ml-[212px] lg:px-8 lg:pt-6">
          {children}
        </main>
      </body>
    </html>
  )
}
