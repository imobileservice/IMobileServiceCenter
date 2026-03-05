"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import { LogOut, Package, UserIcon, Edit2, Check, X, CreditCard, Download, MapPin, Heart, Lock, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
} from "@/components/ui/alert-dialog"
import { useAuthStore } from "@/lib/store"
import { authService } from "@/lib/supabase/services/auth"
import { accountService } from "@/lib/supabase/services/account"
import { userService } from "@/lib/supabase/services/user"
import { clearSupabaseCache } from "@/lib/supabase/client"
import AddressModal from "@/components/address-modal"
import OrderHistory from "@/components/order-history"
import { toast } from "sonner"
import { formatCurrency } from "@/lib/utils/currency"

export default function ProfilePage() {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const [activeTab, setActiveTab] = useState<"dashboard" | "orders" | "credits" | "downloads" | "addresses" | "account" | "wishlist">("dashboard")
  const [isEditing, setIsEditing] = useState(false)
  const [editData, setEditData] = useState({
    name: user?.name || "",
    email: user?.email || "",
    whatsapp: user?.whatsapp || "",
  })
  const setUser = useAuthStore((state) => state.setUser)
  const [addresses, setAddresses] = useState<any[]>([])
  const [wishlist, setWishlist] = useState<any[]>([])
  const [credits, setCredits] = useState<number>(0)
  const [downloads, setDownloads] = useState<any[]>([])
  const [addressModalOpen, setAddressModalOpen] = useState(false)
  const [addressInitial, setAddressInitial] = useState<any | null>(null)
  const [isDeletingAccount, setIsDeletingAccount] = useState(false)

  useEffect(() => {
    if (user) {
      setEditData({
        name: user.name || "",
        email: user.email || "",
        whatsapp: user.whatsapp || "",
      })
    }
  }, [user])

  // Load tab-specific data from database
  useEffect(() => {
    if (!user) return

    const load = async () => {
      try {
        if (activeTab === "addresses") {
          console.log('[Profile] Loading addresses...')
          const data = await accountService.listAddresses()
          console.log('[Profile] Addresses loaded:', data?.length || 0)
          setAddresses(data || [])
        } else if (activeTab === "wishlist") {
          console.log('[Profile] Loading wishlist...')
          const data = await accountService.getWishlist()
          console.log('[Profile] Wishlist loaded:', data?.length || 0)
          setWishlist(data || [])
        } else if (activeTab === "credits") {
          console.log('[Profile] Loading credits...')
          const value = await accountService.getCredits()
          console.log('[Profile] Credits loaded:', value)
          setCredits(Number(value || 0))
        } else if (activeTab === "downloads") {
          console.log('[Profile] Loading downloads...')
          const data = await accountService.getDownloads()
          console.log('[Profile] Downloads loaded:', data?.length || 0)
          setDownloads(data || [])
        } else if (activeTab === "account") {
          // Load profile data for account tab
          try {
            const profile = await authService.getProfile(user.id)
            if (profile) {
              setEditData({
                name: profile.name || "",
                email: profile.email || user.email || "",
                whatsapp: profile.whatsapp || "",
              })
            }
          } catch (profileError) {
            console.warn('[Profile] Failed to load profile data:', profileError)
          }
        }
      } catch (err: any) {
        console.error("[Profile] Failed to load profile data:", err?.message || err)
        toast.error(`Failed to load ${activeTab} data: ${err.message || 'Unknown error'}`)
      }
    }
    load()
  }, [activeTab, user])

  const addAddress = async (type: "billing" | "shipping") => {
    setAddressInitial({ type })
    setAddressModalOpen(true)
  }

  const removeAddress = async (id: string) => {
    try {
      await accountService.deleteAddress(id)
      setAddresses(addresses.filter((a) => a.id !== id))
      toast.success("Address removed")
    } catch (e: any) {
      toast.error(e.message || "Failed to remove address")
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-4">Please sign in</h1>
          <p className="text-muted-foreground mb-8">You need to be signed in to view your profile</p>
          <Button onClick={() => navigate("/signin")}>Sign In</Button>
        </div>
      </div>
    )
  }

  const handleLogout = async () => {
    try {
      await logout()
      navigate("/")
    } catch (error) {
      console.error("Logout error:", error)
    }
  }

  const handleSaveProfile = async () => {
    if (!user) return

    try {
      await authService.updateProfile(user.id, {
        name: editData.name,
        whatsapp: editData.whatsapp,
      })

      // Update the store with new user data
      setUser({
        ...user,
        name: editData.name,
        whatsapp: editData.whatsapp,
      })

      setIsEditing(false)
      toast.success("Profile updated successfully!")
    } catch (error: any) {
      console.error("Failed to update profile:", error)
      toast.error(error.message || "Failed to update profile")
    }
  }


  const handleDeleteAccount = async () => {
    try {
      setIsDeletingAccount(true)
      await userService.deleteAccount()

      toast.success("Account deleted successfully")

      toast.success("Account deleted successfully")

      // Manual cleanup to avoid 403 error from server (since user is already deleted)
      // Do not call logout() here as it tries to reach the server
      clearSupabaseCache()
      localStorage.removeItem('supabase_session_token')
      setUser(null)

      navigate("/")
    } catch (error: any) {
      console.error("Failed to delete account:", error)
      toast.error(error.message || "Failed to delete account")
      setIsDeletingAccount(false)
      toast.error(error.message || "Failed to delete account")
      setIsDeletingAccount(false)
    }
  }

  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: UserIcon },
    { id: "orders", label: "Orders", icon: Package },
    { id: "credits", label: "Store Credits", icon: CreditCard },
    { id: "downloads", label: "Downloads", icon: Download },
    { id: "addresses", label: "Addresses", icon: MapPin },
    { id: "account", label: "Account details", icon: Edit2 },
    { id: "wishlist", label: "Wishlist", icon: Heart },
  ]

  const renderContent = () => {
    switch (activeTab) {
      case "dashboard":
        return (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold mb-2">Hello {user.name}</h1>
              <p className="text-muted-foreground">
                From your account dashboard you can view your recent orders, manage your shipping and billing addresses, and edit your password and account details.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {menuItems.slice(1).map((item) => {
                const Icon = item.icon
                return (
                  <motion.button
                    key={item.id}
                    onClick={() => setActiveTab(item.id as any)}
                    className="bg-card border border-border rounded-lg p-6 hover:shadow-md transition-shadow text-left"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Icon className="w-8 h-8 text-muted-foreground mb-3" />
                    <p className="font-semibold">{item.label}</p>
                  </motion.button>
                )
              })}
            </div>
          </div>
        )

      case "orders":
        return <OrderHistory />

      case "addresses":
        return (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold mb-2">Addresses</h1>
              <p className="text-muted-foreground">The following addresses will be used on the checkout page by default.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-card border border-border rounded-lg p-6">
                <h2 className="text-lg font-bold mb-4">BILLING ADDRESS</h2>
                <Button variant="outline" className="gap-2 mb-4" onClick={() => addAddress("billing")}>
                  <Edit2 className="w-4 h-4" />
                  Add Billing address
                </Button>
                {addresses.filter(a => a.type === "billing").length === 0 ? (
                  <p className="text-muted-foreground">You have not set up this type of address yet.</p>
                ) : (
                  <div className="space-y-3">
                    {addresses.filter(a => a.type === "billing").map((a) => (
                      <div key={a.id} className="border border-border rounded p-3">
                        <p className="font-medium">{a.full_name}</p>
                        <p className="text-sm text-muted-foreground">{a.address_line1}{a.city ? `, ${a.city}` : ""}{a.country ? `, ${a.country}` : ""}</p>
                        <div className="mt-2 flex gap-2">
                          <Button size="sm" onClick={() => { setAddressInitial(a); setAddressModalOpen(true) }}>Edit</Button>
                          <Button size="sm" variant="outline" onClick={() => removeAddress(a.id)}>Delete</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-card border border-border rounded-lg p-6">
                <h2 className="text-lg font-bold mb-4">SHIPPING ADDRESS</h2>
                <Button variant="outline" className="gap-2 mb-4" onClick={() => addAddress("shipping")}>
                  <Edit2 className="w-4 h-4" />
                  Add Shipping address
                </Button>
                {addresses.filter(a => a.type === "shipping").length === 0 ? (
                  <p className="text-muted-foreground">You have not set up this type of address yet.</p>
                ) : (
                  <div className="space-y-3">
                    {addresses.filter(a => a.type === "shipping").map((a) => (
                      <div key={a.id} className="border border-border rounded p-3">
                        <p className="font-medium">{a.full_name}</p>
                        <p className="text-sm text-muted-foreground">{a.address_line1}{a.city ? `, ${a.city}` : ""}{a.country ? `, ${a.country}` : ""}</p>
                        <div className="mt-2 flex gap-2">
                          <Button size="sm" onClick={() => { setAddressInitial(a); setAddressModalOpen(true) }}>Edit</Button>
                          <Button size="sm" variant="outline" onClick={() => removeAddress(a.id)}>Delete</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )

      case "account":
        return (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold mb-2">Account details</h1>
            </div>

            <div className="bg-card border border-border rounded-lg p-6 space-y-6">
              <div>
                <label className="block text-sm font-semibold mb-2">Full name *</label>
                <Input
                  value={editData.name}
                  onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                  placeholder="Enter your name"
                  disabled={!isEditing}
                />
                <p className="text-sm text-muted-foreground mt-1">This will be how your name will be displayed in the account section and in reviews</p>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Email address *</label>
                <Input
                  type="email"
                  value={editData.email}
                  disabled
                  className="bg-muted cursor-not-allowed"
                />
                <p className="text-sm text-muted-foreground mt-1">Email cannot be changed. Contact support if you need to update your email.</p>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Phone Number</label>
                <Input
                  type="tel"
                  value={editData.whatsapp}
                  onChange={(e) => setEditData({ ...editData, whatsapp: e.target.value })}
                  placeholder="+94 77 123 4567"
                  disabled={!isEditing}
                />
              </div>

              <div className="flex gap-2">
                {isEditing ? (
                  <>
                    <Button onClick={handleSaveProfile} className="flex-1">
                      <Check className="w-4 h-4 mr-2" />
                      Save Changes
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setIsEditing(false)
                        setEditData({
                          name: user.name || "",
                          email: user.email || "",
                          whatsapp: user.whatsapp || "",
                        })
                      }}
                    >
                      <X className="w-4 h-4 mr-2" />
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button onClick={() => setIsEditing(true)} className="w-full">
                    <Edit2 className="w-4 h-4 mr-2" />
                    Edit Profile
                  </Button>
                )}
              </div>

              <div className="pt-6 border-t border-border mt-6">
                <h3 className="text-lg font-semibold text-destructive mb-2">Danger Zone</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Once you delete your account, there is no going back. Please be certain.
                </p>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="w-full sm:w-auto">
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete My Account
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete your account
                        and remove your data from our servers.
                        <br /><br />
                        Note: All your orders, addresses, and wishlist items will be permanently deleted.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={(e) => {
                          e.preventDefault()
                          handleDeleteAccount()
                        }}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        disabled={isDeletingAccount}
                      >
                        {isDeletingAccount ? "Deleting..." : "Delete Permanently"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </div>
        )

      case "credits":
        return (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold mb-2">Store Credits</h1>
              <p className="text-muted-foreground">Manage your store credits and rewards.</p>
            </div>
            <div className="bg-card border border-border rounded-lg p-6 text-center">
              <CreditCard className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-bold mb-2">{credits?.toFixed ? credits.toFixed(2) : Number(credits).toFixed(2)} Credits</h3>
              <p className="text-muted-foreground">Credits can be applied at checkout on eligible items.</p>
            </div>
          </div>
        )

      case "downloads":
        return (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold mb-2">Downloads</h1>
              <p className="text-muted-foreground">Your downloadable products and files.</p>
            </div>
            {downloads.length === 0 ? (
              <div className="bg-card border border-border rounded-lg p-6 text-center">
                <Download className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-bold mb-2">No Downloads Available</h3>
                <p className="text-muted-foreground">You don't have any downloadable products yet.</p>
              </div>
            ) : (
              <div className="bg-card border border-border rounded-lg p-6 space-y-3">
                {downloads.map((d) => (
                  <div key={d.id} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{d.title}</p>
                      <p className="text-xs text-muted-foreground">{new Date(d.created_at).toLocaleString()}</p>
                    </div>
                    <a href={d.file_url} target="_blank" className="text-primary underline">Download</a>
                  </div>
                ))}
              </div>
            )}
          </div>
        )

      case "wishlist":
        return (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold mb-2">Wishlist</h1>
              <p className="text-muted-foreground">Your saved products and favorites.</p>
            </div>
            {wishlist.length === 0 ? (
              <div className="bg-card border border-border rounded-lg p-6 text-center">
                <Heart className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-bold mb-2">Your Wishlist is Empty</h3>
                <p className="text-muted-foreground">Start adding products to your wishlist to save them for later.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {wishlist.map((w) => (
                  <div key={w.id} className="bg-card border border-border rounded-lg p-4">
                    {w.products ? (
                      <>
                        <img
                          src={w.products.image || "/placeholder.svg"}
                          alt={w.products.name}
                          className="w-full h-32 object-cover rounded mb-2"
                        />
                        <h3 className="font-semibold text-sm mb-1">{w.products.name}</h3>
                        <p className="text-sm text-muted-foreground mb-2">{formatCurrency(w.products.price)}</p>
                      </>
                    ) : (
                      <div className="text-sm mb-2">Product ID: {w.product_id}</div>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full mt-2"
                      onClick={async () => {
                        try {
                          await accountService.removeFromWishlist(w.product_id)
                          setWishlist(wishlist.filter((x) => x.product_id !== w.product_id))
                          toast.success("Removed from wishlist")
                        } catch (error: any) {
                          toast.error(error.message || "Failed to remove from wishlist")
                        }
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-card border border-border rounded-lg p-6">
              <h2 className="text-lg font-bold mb-6">MY ACCOUNT</h2>
              <nav className="space-y-2">
                {menuItems.map((item) => {
                  const Icon = item.icon
                  const isActive = activeTab === item.id
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id as any)}
                      className={`w-full text-left px-4 py-3 rounded-lg transition-colors flex items-center gap-3 ${isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </button>
                  )
                })}
                <button
                  onClick={handleLogout}
                  className="w-full text-left px-4 py-3 rounded-lg transition-colors flex items-center gap-3 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Logout</span>
                </button>
              </nav>
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              {renderContent()}
            </motion.div>
          </div>
        </div>
      </div>
      <AddressModal
        isOpen={addressModalOpen}
        initial={addressInitial || undefined}
        onClose={() => setAddressModalOpen(false)}
        onSave={async (payload) => {
          try {
            console.log("[Profile] Saving address payload:", payload)

            // Validate required fields
            if (!payload.full_name || !payload.address_line1 || !payload.city || !payload.country) {
              toast.error("Please fill in all required fields")
              return
            }

            const savedAddress = await accountService.upsertAddress(payload)
            console.log("[Profile] Address saved successfully:", savedAddress?.id)

            // Reload addresses
            const data = await accountService.listAddresses()
            setAddresses(data || [])
            setAddressModalOpen(false)
            toast.success("Address saved successfully!")
          } catch (e: any) {
            console.error("[Profile] Address save failed:", e)
            const errorMessage = e.message || "Failed to save address"
            toast.error(errorMessage.includes('timeout')
              ? "Request timed out. Please check your connection and try again."
              : errorMessage.includes('Not authenticated')
                ? "Please sign in to save addresses"
                : errorMessage)
            throw e // Re-throw so modal can handle it
          }
        }}
      />
    </div>
  )
}
