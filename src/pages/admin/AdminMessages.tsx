"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Search, Eye, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { messagesService } from "@/lib/supabase/services/messages"
import MessageDetailsModal from "@/components/admin/message-details-modal"
import AdminLayout from "@/components/admin-layout"
import type { Database } from "@/lib/supabase/types"

type Message = Database['public']['Tables']['messages']['Row']

export default function MessagesPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedMessage, setSelectedMessage] = useState<string | null>(null)

  const fetchMessages = async () => {
    try {
      setLoading(true)
      const data = await messagesService.getAll()
      setMessages(data || [])
    } catch (error) {
      console.error('Failed to fetch messages:', error)
      setMessages([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMessages()
    
    // Listen for message updates
    const handleMessageUpdate = () => {
      fetchMessages()
    }
    window.addEventListener('messageUpdated', handleMessageUpdate)
    
    return () => {
      window.removeEventListener('messageUpdated', handleMessageUpdate)
    }
  }, [])

  const filteredMessages = messages.filter(
    (m) =>
      m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.email.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this message?')) return
    try {
      await messagesService.delete(id)
      setMessages(prev => prev.filter(m => m.id !== id))
    } catch (error) {
      console.error('Failed to delete message:', error)
      alert('Failed to delete message')
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Unread":
        return "bg-blue-100 text-blue-800"
      case "Read":
        return "bg-gray-100 text-gray-800"
      case "Replied":
        return "bg-green-100 text-green-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div>
          <h1 className="text-4xl font-bold">Messages</h1>
          <p className="text-muted-foreground mt-2">Manage customer inquiries and messages</p>
        </div>
      </motion.div>

      {/* Search */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="relative">
          <Search className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search messages..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </motion.div>

      {/* Messages Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="bg-card border border-border rounded-lg overflow-hidden"
      >
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left py-4 px-6 font-semibold">From</th>
                <th className="text-left py-4 px-6 font-semibold">Subject</th>
                <th className="text-left py-4 px-6 font-semibold">Date</th>
                <th className="text-left py-4 px-6 font-semibold">Status</th>
                <th className="text-left py-4 px-6 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-muted-foreground">Loading messages...</td>
                </tr>
              ) : filteredMessages.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-muted-foreground">No messages found</td>
                </tr>
              ) : (
                filteredMessages.map((message) => (
                <motion.tr
                  key={message.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={`border-b border-border hover:bg-muted/50 transition-colors ${
                    (message.status || 'unread').toLowerCase() === "unread" ? "bg-blue-50/50" : ""
                  }`}
                >
                  <td className="py-4 px-6">
                    <div>
                      <p className="font-semibold">{message.name}</p>
                      <p className="text-sm text-muted-foreground">{message.email}</p>
                    </div>
                  </td>
                  <td className="py-4 px-6 font-semibold">{message.subject}</td>
                  <td className="py-4 px-6">{new Date(message.created_at).toLocaleDateString()}</td>
                  <td className="py-4 px-6">
                    <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getStatusColor(message.status || 'unread')}`}>
                      {message.status || 'Unread'}
                    </span>
                  </td>
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedMessage(message.id)}
                        className="gap-2"
                      >
                        <Eye className="w-4 h-4" />
                        View
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDelete(message.id)}
                        className="gap-2 text-red-600 hover:text-red-700 bg-transparent"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </Button>
                    </div>
                  </td>
                </motion.tr>
              ))
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Message Details Modal */}
      {selectedMessage && <MessageDetailsModal messageId={selectedMessage} onClose={() => setSelectedMessage(null)} />}
      </div>
    </AdminLayout>
  )
}
