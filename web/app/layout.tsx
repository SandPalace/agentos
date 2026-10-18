import type { Metadata } from 'next'
import { JetBrains_Mono, Poppins, Space_Grotesk } from 'next/font/google'
import './globals.css'
import AgentOSProvider from '@/components/AgentOSProvider'
import AuthGate from '@/components/AuthGate'
import { ThemeProvider, THEME_INIT_SCRIPT } from '@/lib/theme'

const poppins = Poppins({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-poppins' })
const grotesk = Space_Grotesk({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-grotesk' })
const jetbrains = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-jetbrains' })

export const metadata: Metadata = {
  title: 'AgentOS · Oficina',
  description: 'Tu equipo de agentes de Claude, trabajando en vivo.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${poppins.variable} ${grotesk.variable} ${jetbrains.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} /></head>
      <body>
        <ThemeProvider>
          <AuthGate><AgentOSProvider>{children}</AgentOSProvider></AuthGate>
        </ThemeProvider>
      </body>
    </html>
  )
}
