import { create } from "zustand"

export interface Customer {
  id: string
  name: string
  email: string
  phone: string
  address: string
  joinDate: string
  totalOrders: number
  totalSpent: number
  status: "Active" | "Inactive"
}

interface CustomerState {
  customers: Customer[]
  addCustomer: (customer: Omit<Customer, "id">) => void
  updateCustomer: (id: string, customer: Partial<Customer>) => void
  deleteCustomer: (id: string) => void
}

const INITIAL_CUSTOMERS: Customer[] = [
  {
    id: "1",
    name: "John Doe",
    email: "john@example.com",
    phone: "+94 70 558 8789",
    address: "123 Main St, Meegoda, Sri Lanka",
    joinDate: "2024-01-10",
    totalOrders: 5,
    totalSpent: 6495,
    status: "Active",
  },
  {
    id: "2",
    name: "Jane Smith",
    email: "jane@example.com",
    phone: "+94 70 558 8789",
    address: "456 Oak Ave, Meegoda, Sri Lanka",
    joinDate: "2024-01-15",
    totalOrders: 3,
    totalSpent: 3597,
    status: "Active",
  },
  {
    id: "3",
    name: "Mike Johnson",
    email: "mike@example.com",
    phone: "+94 70 558 8789",
    address: "789 Pine Rd, Meegoda, Sri Lanka",
    joinDate: "2023-12-20",
    totalOrders: 8,
    totalSpent: 9999,
    status: "Active",
  },
  {
    id: "4",
    name: "Sarah Williams",
    email: "sarah@example.com",
    phone: "+94 70 558 8789",
    address: "321 Elm St, Meegoda, Sri Lanka",
    joinDate: "2023-11-05",
    totalOrders: 2,
    totalSpent: 1899,
    status: "Inactive",
  },
]

export const useCustomerStore = create<CustomerState>((set) => ({
  customers: INITIAL_CUSTOMERS,
  addCustomer: (customer) =>
    set((state) => ({
      customers: [
        ...state.customers,
        {
          ...customer,
          id: Date.now().toString(),
        },
      ],
    })),
  updateCustomer: (id, updates) =>
    set((state) => ({
      customers: state.customers.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    })),
  deleteCustomer: (id) =>
    set((state) => ({
      customers: state.customers.filter((c) => c.id !== id),
    })),
}))
