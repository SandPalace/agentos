'use client'
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { readOfficeView, writeOfficeView } from './officeView'

interface OfficeViewCtx { officeView: boolean; setOfficeView: (on: boolean) => void; toggle: () => void }
const Ctx = createContext<OfficeViewCtx>({ officeView: false, setOfficeView: () => {}, toggle: () => {} })

const storage = () => { try { return window.localStorage } catch { return null } }

/** «Vista oficina» por navegador, igual que el tema: apagada por defecto, se lee al montar y se guarda al cambiar. */
export function OfficeViewProvider({ children }: { children: React.ReactNode }) {
  const [officeView, setState] = useState(false)
  useEffect(() => { setState(readOfficeView(storage())) }, [])
  const setOfficeView = useCallback((on: boolean) => { setState(on); writeOfficeView(storage(), on) }, [])
  const toggle = useCallback(() => setOfficeView(!officeView), [officeView, setOfficeView])
  return <Ctx.Provider value={{ officeView, setOfficeView, toggle }}>{children}</Ctx.Provider>
}

export const useOfficeView = () => useContext(Ctx)
