import { create } from "zustand"

export interface Message {
  id: string
  name: string
  email: string
  subject: string
  message: string
  date: string
  status: "Unread" | "Read" | "Replied"
}

interface MessageState {
  messages: Message[]
  updateMessageStatus: (id: string, status: Message["status"]) => void
  deleteMessage: (id: string) => void
}

const INITIAL_MESSAGES: Message[] = [
  {
    id: "1",
    name: "John Doe",
    email: "john@example.com",
    subject: "Product Inquiry",
    message: "Hi, I'm interested in the iPhone 15 Pro Max. Can you provide more details about the specifications?",
    date: "2024-01-20",
    status: "Unread",
  },
  {
    id: "2",
    name: "Jane Smith",
    email: "jane@example.com",
    subject: "Warranty Question",
    message: "What is the warranty period for your products? Do you offer extended warranty options?",
    date: "2024-01-19",
    status: "Read",
  },
  {
    id: "3",
    name: "Mike Johnson",
    email: "mike@example.com",
    subject: "Bulk Order",
    message: "We are interested in placing a bulk order for our company. Can you provide a quote for 50 units?",
    date: "2024-01-18",
    status: "Replied",
  },
  {
    id: "4",
    name: "Sarah Williams",
    email: "sarah@example.com",
    subject: "Delivery Issue",
    message: "I received my order but the packaging was damaged. Can you help me with a replacement?",
    date: "2024-01-17",
    status: "Read",
  },
]

export const useMessageStore = create<MessageState>((set) => ({
  messages: INITIAL_MESSAGES,
  updateMessageStatus: (id, status) =>
    set((state) => ({
      messages: state.messages.map((m) => (m.id === id ? { ...m, status } : m)),
    })),
  deleteMessage: (id) =>
    set((state) => ({
      messages: state.messages.filter((m) => m.id !== id),
    })),
}))
