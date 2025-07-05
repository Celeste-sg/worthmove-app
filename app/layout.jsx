// app/layout.js
import './globals.css'

export const metadata = {
  title: 'WorthMove 回国计算器',
  description: 'A calculator that helps you decide whether it is worthwhile to move back to China.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gradient-to-br from-blue-500 via-purple-500 to-green-500 text-white font-sans">
        {children}
      </body>
    </html>
  )
}