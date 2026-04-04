import React from 'react'
import { Routes, Route } from 'react-router-dom'
import { lazy, Suspense } from 'react'

// Lazy load pages for code splitting
const Home = lazy(() => import('./pages/Home'))
const Shop = lazy(() => import('./pages/Shop'))
const ProductDetail = lazy(() => import('./pages/ProductDetail'))
const Cart = lazy(() => import('./pages/Cart'))
const Checkout = lazy(() => import('./pages/Checkout'))
const Invoice = lazy(() => import('./pages/Invoice'))
const Contact = lazy(() => import('./pages/Contact'))
const Profile = lazy(() => import('./pages/Profile'))
const SignIn = lazy(() => import('./pages/SignIn'))
const SignUp = lazy(() => import('./pages/SignUp'))
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'))
const About = lazy(() => import('./pages/About'))
const Problem = lazy(() => import('./pages/Problem'))
const TestSupabase = lazy(() => import('./pages/TestSupabase'))
const AuthError = lazy(() => import('./pages/AuthError'))
const AuthCallback = lazy(() => import('./pages/AuthCallback'))
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'))
const AdminProducts = lazy(() => import('./pages/admin/AdminProducts'))
const AdminCategories = lazy(() => import('./pages/admin/AdminCategories'))
const AdminOrders = lazy(() => import('./pages/admin/AdminOrders'))
const AdminCustomers = lazy(() => import('./pages/admin/AdminCustomers'))
const AdminMessages = lazy(() => import('./pages/admin/AdminMessages'))
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'))
const AdminFilters = lazy(() => import('./pages/admin/AdminFilters'))
const AdminHeroSlides = lazy(() => import('./pages/admin/AdminHeroSlides'))
const AdminLogin = lazy(() => import('./pages/admin/AdminLogin'))
const AdminGuide = lazy(() => import('./pages/admin/Guide'))
const AdminCashiers = lazy(() => import('./pages/admin/AdminCashiers'))
const AdminInventory = lazy(() => import('./pages/admin/inventory/InventoryPage'))
const AdminSales = lazy(() => import('./pages/admin/inventory/SalesPage'))
const CashierLogin = lazy(() => import('./pages/cashier/CashierLogin'))
const CashierPOS = lazy(() => import('./pages/cashier/CashierPOS'))

// Loading component
const PageLoading = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
  </div>
)

export default function App() {
  return (
    <Suspense fallback={<PageLoading />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/shop" element={<Shop />} />
        <Route path="/product/:id" element={<ProductDetail />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/invoice/:id" element={<Invoice />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/about" element={<About />} />
        <Route path="/problem" element={<Problem />} />
        <Route path="/test-supabase" element={<TestSupabase />} />
        <Route path="/auth/error" element={<AuthError />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
        <Route path="/admin/products" element={<AdminProducts />} />
        <Route path="/admin/categories" element={<AdminCategories />} />
        <Route path="/admin/orders" element={<AdminOrders />} />
        <Route path="/admin/customers" element={<AdminCustomers />} />
        <Route path="/admin/messages" element={<AdminMessages />} />
        <Route path="/admin/hero-slides" element={<AdminHeroSlides />} />
        <Route path="/admin/settings" element={<AdminSettings />} />
        <Route path="/admin/filters" element={<AdminFilters />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin/guide" element={<AdminGuide />} />
        <Route path="/admin/inventory" element={<AdminInventory />} />
        <Route path="/admin/sales" element={<AdminSales />} />
        <Route path="/admin/cashiers" element={<AdminCashiers />} />
        <Route path="/cashier/login" element={<CashierLogin />} />
        <Route path="/cashier/pos" element={<CashierPOS />} />
      </Routes>
    </Suspense>
  )
}

