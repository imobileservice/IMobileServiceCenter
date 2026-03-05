"use client"

import { useState, useEffect, useRef } from "react"
import { motion } from "framer-motion"
import { Link, useNavigate } from "react-router-dom"
import { Check, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuthStore } from "@/lib/store"
import { cartService } from "@/lib/supabase/services/cart"
import { ordersService } from "@/lib/supabase/services/orders"
import { authService } from "@/lib/supabase/services/auth"
import CheckoutForm from "@/components/checkout-form"
import OrderSummary from "@/components/order-summary"
import { toast } from "sonner"
import { getApiUrl } from "@/lib/utils/api"
import { formatCurrency } from "@/lib/utils/currency"


export default function CheckoutPage() {
    const navigate = useNavigate()
    const user = useAuthStore((state) => state.user)
    const [step, setStep] = useState(1)
    const [orderPlaced, setOrderPlaced] = useState(false)
    const [orderNumber, setOrderNumber] = useState<string | null>(null)
    const [orderId, setOrderId] = useState<string | null>(null)
    const [customerPhone, setCustomerPhone] = useState<string | null>(null)
    const [customerEmail, setCustomerEmail] = useState<string | null>(null)
    const [cartItems, setCartItems] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const checkoutStartTime = useRef<number>(Date.now())
    const hasTrackedAbandonment = useRef(false)

    // Redirect if not logged in
    useEffect(() => {
        if (!user) {
            navigate("/signin")
            return
        }
    }, [user, navigate])

    // Load cart items from database
    useEffect(() => {
        if (!user) return

        const loadCart = async () => {
            try {
                setLoading(true)
                const items = await cartService.getCartItems(user.id)
                setCartItems((items || []) as any[])
            } catch (error: any) {
                console.error("Failed to load cart:", error)
                toast.error("Failed to load cart items")
            } finally {
                setLoading(false)
            }
        }

        loadCart()
    }, [user])

    // Track checkout abandonment when user leaves
    useEffect(() => {
        const handleBeforeUnload = () => {
            if (!orderPlaced && !hasTrackedAbandonment.current) {
                trackCheckoutAbandonment()
            }
        }

        window.addEventListener('beforeunload', handleBeforeUnload)
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload)
            if (!orderPlaced && !hasTrackedAbandonment.current) {
                trackCheckoutAbandonment()
            }
        }
    }, [orderPlaced])

    const trackCheckoutAbandonment = async () => {
        if (!user || hasTrackedAbandonment.current) return
        hasTrackedAbandonment.current = true

        try {
            await authService.updateProfile(user.id, {
                checkout_status: 'cancel'
            })
        } catch (error) {
            console.error("Failed to track checkout abandonment:", error)
        }
    }

    const handleComplete = async (formData: any) => {
        if (!user || cartItems.length === 0) {
            toast.error("Cart is empty")
            return
        }

        if (loading) {
            console.log('[Checkout] Already processing, ignoring duplicate click')
            return
        }

        try {
            setLoading(true)
            console.log('[Checkout] Starting order creation...', { userId: user.id, itemCount: cartItems.length })

            try {
                await Promise.race([
                    authService.updateProfile(user.id, { checkout_status: 'pending' }),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Profile update timeout')), 5000))
                ])
            } catch (profileError: any) {
                console.warn("[Checkout] Profile update failed (non-critical):", profileError.message)
            }

            console.log('[Checkout] Generating order number...')
            const orderNum = await Promise.race([
                ordersService.generateOrderNumber(),
                new Promise<string>((_, reject) => setTimeout(() => reject(new Error('Order number generation timeout')), 15000))
            ])
            console.log('[Checkout] Order number generated:', orderNum)

            const getPrice = (item: any) => {
                if (item.variant_selected && typeof item.variant_selected === 'object' && 'price' in item.variant_selected) {
                    return Number(item.variant_selected.price) || Number(item.products.price)
                }
                return Number(item.products.price)
            }

            const subtotal = cartItems.reduce((sum, item) => {
                return sum + (getPrice(item) * item.quantity)
            }, 0)
            const shipping = subtotal > 15000 ? 0 : 500
            const tax = 0 // Tax removed as requested
            const total = subtotal + shipping + tax

            const orderItems = cartItems.map(item => ({
                product_id: item.product_id,
                product_name: item.products.name,
                product_image: item.products.image,
                quantity: item.quantity,
                price: getPrice(item),
                variant_selected: item.variant_selected // Persist variant info
            }))

            console.log('[Checkout] Creating order in database...')
            const orderPromise = ordersService.create({
                order_number: orderNum,
                user_id: user.id,
                customer_name: formData.fullName,
                customer_email: formData.email,
                customer_phone: formData.whatsapp || formData.alternateNumber,
                shipping_address: `${formData.addressLine1}${formData.addressLine2 ? ', ' + formData.addressLine2 : ''}, ${formData.city}, ${formData.postalCode}`,
                billing_address: formData.addressLine1,
                items: orderItems as any,
                subtotal: subtotal,
                shipping: shipping,
                tax: tax,
                total: total,
                status: 'pending',
                payment_method: formData.paymentMethod,
                payment_status: 'pending',
            }, orderItems)

            const order = await Promise.race([
                orderPromise,
                new Promise<any>((_, reject) => setTimeout(() => reject(new Error('Order creation timeout')), 30000))
            ])
            console.log('[Checkout] Order created successfully:', order.id)

            console.log('[Checkout] Clearing cart...')
            try {
                await Promise.race([
                    cartService.clearCart(user.id),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Clear cart timeout')), 10000))
                ])
                console.log('[Checkout] Cart cleared')
            } catch (clearError: any) {
                console.warn("[Checkout] Cart clear failed (non-critical):", clearError.message)
            }

            console.log('[Checkout] Updating profile status to success...')
            try {
                await Promise.race([
                    authService.updateProfile(user.id, { checkout_status: 'success' }),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Profile update timeout')), 5000))
                ])
                console.log('[Checkout] Profile status updated')
            } catch (profileError: any) {
                console.warn("[Checkout] Profile update failed (non-critical):", profileError.message)
            }

            window.dispatchEvent(new CustomEvent('orderUpdated', { detail: { timestamp: Date.now() } }))
            localStorage.setItem('adminUpdate_order', JSON.stringify({ type: 'order', timestamp: Date.now() }))

            setOrderNumber(orderNum)
            setOrderId(order.id)
            setCustomerPhone(formData.whatsapp || formData.alternateNumber || null)
            setCustomerEmail(formData.email || null)
            setOrderPlaced(true)
            toast.success("Order placed successfully!")

            // Automatically send invoice via email is now handled by the server
            // We just show a toast to inform the user
            if (formData.email) {
                if (order.warning) {
                    console.warn('Invoice email failed:', order.warning)
                    toast.warning(`Order placed but email failed: ${order.warning}`)
                } else {
                    toast.info(`Invoice sent to ${formData.email}`)
                }
            }
        } catch (error: any) {
            console.error("Order creation failed:", error)
            toast.error(error.message || "Failed to place order")

            try {
                await authService.updateProfile(user.id, {
                    checkout_status: 'cancel'
                })
            } catch (updateError) {
                console.error("Failed to update checkout status:", updateError)
            }
        } finally {
            setLoading(false)
        }
    }

    if (!user) {
        return null
    }

    if (loading && !orderPlaced) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="text-center">
                    <p className="text-muted-foreground">Loading checkout...</p>
                </div>
            </div>
        )
    }

    if (cartItems.length === 0 && !orderPlaced) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="text-center">
                    <h1 className="text-3xl font-bold mb-4">Your cart is empty</h1>
                    <Link to="/shop">
                        <Button>Continue Shopping</Button>
                    </Link>
                </div>
            </div>
        )
    }

    if (orderPlaced) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5 }}
                    className="text-center max-w-md"
                >
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.2, type: "spring" }}
                        className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6"
                    >
                        <Check className="w-8 h-8 text-white" />
                    </motion.div>

                    <h1 className="text-3xl font-bold mb-2">Order Confirmed!</h1>
                    <p className="text-muted-foreground mb-8">
                        Thank you for your purchase. Your order has been placed successfully.
                    </p>

                    <div className="bg-muted border border-border rounded-lg p-6 mb-8 text-left">
                        <p className="text-sm text-muted-foreground mb-2">Order Number</p>
                        <p className="font-bold text-lg mb-4">{orderNumber || 'Loading...'}</p>
                        <p className="text-sm text-muted-foreground mb-2">Estimated Delivery</p>
                        <p className="font-semibold">3-5 Business Days</p>
                        {customerPhone && (
                            <p className="text-xs text-muted-foreground mt-4">
                                WhatsApp will open automatically with your invoice link.
                            </p>
                        )}
                    </div>

                    <div className="space-y-3">
                        {orderId && (
                            <Link to={`/invoice/${orderId}`} className="block">
                                <Button variant="outline" className="w-full">
                                    View Invoice
                                </Button>
                            </Link>
                        )}
                        <Link to="/profile" className="block">
                            <Button variant="outline" className="w-full bg-transparent">
                                View Order Details
                            </Button>
                        </Link>
                        <Link to="/shop" className="block">
                            <Button variant="outline" className="w-full bg-transparent">
                                Continue Shopping
                            </Button>
                        </Link>
                    </div>
                </motion.div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-background">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="mb-12">
                    <div className="flex items-center justify-between mb-8">
                        {[1, 2, 3].map((s) => (
                            <div key={s} className="flex items-center flex-1">
                                <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-colors ${s <= step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                                        }`}
                                >
                                    {s < step ? <Check className="w-5 h-5" /> : s}
                                </motion.div>
                                {s < 3 && (
                                    <div className={`flex-1 h-1 mx-2 transition-colors ${s < step ? "bg-primary" : "bg-muted"}`} />
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="flex justify-between text-xs sm:text-sm px-2">
                        <span className={step >= 1 ? "font-semibold hidden sm:inline" : "text-muted-foreground hidden sm:inline"}>Shipping</span>
                        <span className={step >= 2 ? "font-semibold hidden sm:inline" : "text-muted-foreground hidden sm:inline"}>Payment</span>
                        <span className={step >= 3 ? "font-semibold hidden sm:inline" : "text-muted-foreground hidden sm:inline"}>Confirmation</span>
                        <span className={step >= 1 ? "font-semibold sm:hidden" : "text-muted-foreground sm:hidden"}>Ship</span>
                        <span className={step >= 2 ? "font-semibold sm:hidden" : "text-muted-foreground sm:hidden"}>Pay</span>
                        <span className={step >= 3 ? "font-semibold sm:hidden" : "text-muted-foreground sm:hidden"}>Confirm</span>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2">
                        <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.3 }}
                        >
                            <CheckoutForm
                                step={step}
                                onNext={() => setStep(step + 1)}
                                onPrevious={() => setStep(step - 1)}
                                onComplete={handleComplete}
                            />
                        </motion.div>
                    </div>

                    <OrderSummary cartItems={cartItems} />
                </div>
            </div>
        </div>
    )
}
