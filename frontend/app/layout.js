import './globals.css'
import Navbar from '@/components/Navbar'

export const metadata = {
  title: 'AstroPropose',
  description: 'A General and Customizable Framework for Astronomical Observing Proposals',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-gray-900 antialiased">
        <Navbar />
        <main className="container mx-auto px-4 py-8">
          {children}
        </main>
      </body>
    </html>
  )
}
