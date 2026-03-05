"use client"

import { useState, useEffect } from "react"
import { motion, Reorder } from "framer-motion"
import { Plus, Search, Filter as FilterIcon, MoreVertical, Edit, Trash, Grid, GripVertical } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import AdminLayout from "@/components/admin-layout"
import FilterModal from "@/components/admin/filter-modal"
import { filtersService, type Filter } from "@/lib/supabase/services/filters"
import { useRealtimeUpdates } from "@/hooks/use-realtime-updates"
import { toast } from "sonner"

export default function AdminFilters() {
    const [filters, setFilters] = useState<Filter[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editingFilterId, setEditingFilterId] = useState<string | null>(null)

    const fetchFilters = async () => {
        try {
            setLoading(true)
            const data = await filtersService.getAll()
            setFilters(data)
        } catch (error) {
            console.error("Failed to fetch filters:", error)
            toast.error("Failed to load filters")
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchFilters()
    }, [])

    // Subscribe to real-time updates
    useRealtimeUpdates(fetchFilters)

    const handleDelete = async (id: string) => {
        if (!window.confirm("Are you sure you want to delete this filter?")) return

        try {
            await filtersService.delete(id)
            setFilters(filters.filter(f => f.id !== id))
            toast.success("Filter deleted successfully")
        } catch (error) {
            console.error("Failed to delete filter:", error)
            toast.error("Failed to delete filter")
        }
    }

    const handleReorder = async (newOrder: Filter[]) => {
        setFilters(newOrder)

        // Create updates array
        const updates = newOrder.map((filter, index) => ({
            id: filter.id,
            sort_order: index
        }))

        try {
            await filtersService.reorder(updates)
        } catch (error) {
            console.error("Failed to update order:", error)
            toast.error("Failed to save new order")
        }
    }

    const filteredFilters = filters.filter(filter =>
        filter.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        filter.key.toLowerCase().includes(searchQuery.toLowerCase())
    )

    return (
        <AdminLayout>
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-purple-600">
                        Filter Management
                    </h1>
                    <p className="text-muted-foreground">Manage product filters and category assignments</p>
                </div>
                <Button onClick={() => { setEditingFilterId(null); setIsModalOpen(true); }} className="gap-2">
                    <Plus className="w-4 h-4" />
                    Add New Filter
                </Button>
            </div>

            <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
                {/* Toolbar */}
                <div className="p-4 border-b border-border flex gap-4">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search filters..."
                            className="pl-9 bg-background"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>

                {/* Filters List */}
                {loading ? (
                    <div className="text-center py-12 text-muted-foreground">Loading filters...</div>
                ) : filteredFilters.length === 0 ? (
                    <div className="text-center py-12">
                        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                            <FilterIcon className="w-8 h-8 text-muted-foreground" />
                        </div>
                        <h3 className="text-lg font-semibold mb-1">No Filters Found</h3>
                        <p className="text-muted-foreground mb-4">Start by adding your first product filter.</p>
                        <Button onClick={() => { setEditingFilterId(null); setIsModalOpen(true); }}>
                            Add Filter
                        </Button>
                    </div>
                ) : (
                    <div className="p-2">
                        <Reorder.Group axis="y" values={filteredFilters} onReorder={handleReorder} className="space-y-2">
                            {filteredFilters.map((filter) => (
                                <Reorder.Item key={filter.id} value={filter} id={filter.id}>
                                    <motion.div
                                        layout
                                        className="bg-background border border-border rounded-lg p-4 flex items-center gap-4 group hover:shadow-md transition-shadow"
                                    >
                                        <div className="cursor-grab active:cursor-grabbing text-muted-foreground p-1 hover:text-foreground">
                                            <GripVertical className="w-5 h-5" />
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <h3 className="font-semibold text-base truncate">{filter.name}</h3>
                                                <Badge variant={filter.is_active ? "default" : "secondary"} className="text-xs">
                                                    {filter.is_active ? "Active" : "Inactive"}
                                                </Badge>
                                                <Badge variant="outline" className="text-xs uppercase">{filter.type}</Badge>
                                            </div>
                                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                                <span className="font-mono bg-muted px-1 rounded">key: {filter.key}</span>
                                                <span>Categories: {filter.categories?.length ? `${filter.categories.length} assigned` : 'All'}</span>
                                                {Array.isArray(filter.options) && filter.options.length > 0 && (
                                                    <span>{filter.options.length} options</span>
                                                )}
                                                {filter.type === 'range' && (
                                                    <span>Range: {filter.min_value} - {filter.max_value}</span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => { setEditingFilterId(filter.id); setIsModalOpen(true); }}
                                            >
                                                <Edit className="w-4 h-4 text-blue-500" />
                                            </Button>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button size="sm" variant="ghost">
                                                        <MoreVertical className="w-4 h-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem
                                                        className="text-red-600 cursor-pointer"
                                                        onClick={() => handleDelete(filter.id)}
                                                    >
                                                        <Trash className="w-4 h-4 mr-2" />
                                                        Delete
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </motion.div>
                                </Reorder.Item>
                            ))}
                        </Reorder.Group>
                    </div>
                )}
            </div>

            <FilterModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                editingFilterId={editingFilterId}
            />
        </AdminLayout>
    )
}
