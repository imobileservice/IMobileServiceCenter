"use client"

import { ReactNode, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import AdminSidebar from "./admin-sidebar"
import { useAdminStore } from "@/lib/admin-store"

interface AdminLayoutProps {
  children: ReactNode
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const navigate = useNavigate()
  const isAuthenticated = useAdminStore((state) => state.isAuthenticated)
  const role = useAdminStore((state) => state.user?.role)
  const logout = useAdminStore((state) => state.logout)

  // The server will not sign anyone but an administrator in, so a non-admin
  // role here means the store was populated some other way. Drop the session
  // rather than render the panel around it.
  const isAdmin = isAuthenticated && (!role || role === "admin")

  useEffect(() => {
    if (isAuthenticated && !isAdmin) logout()
    if (!isAdmin) navigate("/admin/login")
  }, [isAuthenticated, isAdmin, logout, navigate])

  if (!isAdmin) {
    return null // or a loading spinner while redirecting
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminSidebar />
      <main className="lg:pl-64 min-h-screen transition-all duration-300">
        <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto">
          {children}
        </div>
      </main>
    </div>
  )
}

