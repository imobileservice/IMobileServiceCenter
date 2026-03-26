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

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/admin/login")
    }
  }, [isAuthenticated, navigate])

  if (!isAuthenticated) {
    return null // or a loading spinner while redirecting
  }

  return (
    <div className="flex min-h-screen bg-background">
      <AdminSidebar />
      <main className="flex-1 lg:ml-64 p-6 lg:p-8">
        {children}
      </main>
    </div>
  )
}

