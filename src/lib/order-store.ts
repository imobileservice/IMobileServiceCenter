import { create } from "zustand"

export interface Order {
  id: string
  orderNumber: string
  customer: string
  email: string
  phone: string
  items: Array<{
    name: string
    quantity: number
    price: number
  }>
  total: number
  status: "Pending" | "Processing" | "Shipped" | "Delivered" | "Cancelled"
  date: string
  address: string
}

interface OrderState {
  orders: Order[]
  updateOrderStatus: (id: string, status: Order["status"]) => void
}

const INITIAL_ORDERS: Order[] = [
  {
    id: "1",
    orderNumber: "ORD001",
    customer: "John Doe",
    email: "john@example.com",
    phone: "+94 70 558 8789",
    items: [{ name: "iPhone 15 Pro Max", quantity: 1, price: 1299 }],
    total: 1299,
    status: "Delivered",
    date: "2024-01-15",
    address: "123 Main St, Meegoda, Sri Lanka",
  },
  {
    id: "2",
    orderNumber: "ORD002",
    customer: "Jane Smith",
    email: "jane@example.com",
    phone: "+94 70 558 8789",
    items: [{ name: "Samsung Galaxy S24 Ultra", quantity: 1, price: 1199 }],
    total: 1199,
    status: "Processing",
    date: "2024-01-18",
    address: "456 Oak Ave, Meegoda, Sri Lanka",
  },
  {
    id: "3",
    orderNumber: "ORD003",
    customer: "Mike Johnson",
    email: "mike@example.com",
    phone: "+94 70 558 8789",
    items: [
      { name: "Google Pixel 8 Pro", quantity: 1, price: 999 },
      { name: "Phone Case", quantity: 2, price: 25 },
    ],
    total: 1049,
    status: "Shipped",
    date: "2024-01-20",
    address: "789 Pine Rd, Meegoda, Sri Lanka",
  },
]

export const useOrderStore = create<OrderState>((set) => ({
  orders: INITIAL_ORDERS,
  updateOrderStatus: (id, status) =>
    set((state) => ({
      orders: state.orders.map((order) => (order.id === id ? { ...order, status } : order)),
    })),
}))
