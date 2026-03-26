import { create } from "zustand"

export interface Product {
  id: string
  name: string
  category: string
  price: number
  stock: number
  image: string
  description: string
}

interface ProductState {
  products: Product[]
  addProduct: (product: Omit<Product, "id">) => void
  updateProduct: (id: string, product: Partial<Product>) => void
  deleteProduct: (id: string) => void
}

const INITIAL_PRODUCTS: Product[] = [
  {
    id: "1",
    name: "iPhone 15 Pro Max",
    category: "Apple",
    price: 1299,
    stock: 15,
    image: "/iphone-15-pro-max.png",
    description: "Latest Apple flagship with advanced camera system",
  },
  {
    id: "2",
    name: "Samsung Galaxy S24 Ultra",
    category: "Samsung",
    price: 1199,
    stock: 12,
    image: "/samsung-galaxy-s24-ultra.png",
    description: "Premium Android phone with AI features",
  },
  {
    id: "3",
    name: "Google Pixel 8 Pro",
    category: "Google",
    price: 999,
    stock: 8,
    image: "/google-pixel-8-pro.png",
    description: "Google's flagship with exceptional AI photography",
  },
]

export const useProductStore = create<ProductState>((set) => ({
  products: INITIAL_PRODUCTS,
  addProduct: (product) =>
    set((state) => ({
      products: [
        ...state.products,
        {
          ...product,
          id: Date.now().toString(),
        },
      ],
    })),
  updateProduct: (id, updates) =>
    set((state) => ({
      products: state.products.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    })),
  deleteProduct: (id) =>
    set((state) => ({
      products: state.products.filter((p) => p.id !== id),
    })),
}))
