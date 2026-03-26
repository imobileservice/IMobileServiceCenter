"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Star, ThumbsUp } from "lucide-react"
import { Button } from "@/components/ui/button"

interface Review {
  id: number
  author: string
  rating: number
  date: string
  comment: string
  helpful: number
}

interface ProductReviewsProps {
  productId: string
  reviews: Review[]
  rating: number
  totalReviews: number
}

export default function ProductReviews({ productId, reviews, rating, totalReviews }: ProductReviewsProps) {
  const [showAddReview, setShowAddReview] = useState(false)
  const [newReview, setNewReview] = useState({ rating: 5, comment: "", author: "" })
  const [allReviews, setAllReviews] = useState<Review[]>(reviews)

  const handleAddReview = () => {
    if (newReview.comment.trim() && newReview.author.trim()) {
      const review: Review = {
        id: allReviews.length + 1,
        author: newReview.author,
        rating: newReview.rating,
        date: new Date().toISOString().split("T")[0],
        comment: newReview.comment,
        helpful: 0,
      }
      setAllReviews([review, ...allReviews])
      setNewReview({ rating: 5, comment: "", author: "" })
      setShowAddReview(false)
    }
  }

  // Calculate rating distribution
  const ratingDistribution = {
    5: allReviews.filter((r) => r.rating === 5).length,
    4: allReviews.filter((r) => r.rating === 4).length,
    3: allReviews.filter((r) => r.rating === 3).length,
    2: allReviews.filter((r) => r.rating === 2).length,
    1: allReviews.filter((r) => r.rating === 1).length,
  }

  return (
    <div className="space-y-8">
      <div className="border-t border-border pt-8">
        <h2 className="text-2xl font-bold mb-8">Customer Reviews</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          {/* Rating Summary */}
          <div className="bg-muted p-6 rounded-lg">
            <div className="text-center mb-6">
              <p className="text-4xl font-bold mb-2">{rating}</p>
              <div className="flex justify-center gap-1 mb-2">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className={`w-5 h-5 ${i < Math.floor(rating) ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`}
                  />
                ))}
              </div>
              <p className="text-sm text-muted-foreground">Based on {totalReviews} reviews</p>
            </div>
          </div>

          {/* Rating Distribution */}
          <div className="md:col-span-2 space-y-3">
            {[5, 4, 3, 2, 1].map((stars) => (
              <div key={stars} className="flex items-center gap-3">
                <span className="text-sm font-medium w-12">{stars} star</span>
                <div className="flex-1 h-2 bg-border rounded-full overflow-hidden">
                  <div
                    className="h-full bg-yellow-400 transition-all"
                    style={{
                      width: `${totalReviews > 0 ? (ratingDistribution[stars as keyof typeof ratingDistribution] / totalReviews) * 100 : 0}%`,
                    }}
                  />
                </div>
                <span className="text-sm text-muted-foreground w-8 text-right">
                  {ratingDistribution[stars as keyof typeof ratingDistribution]}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Add Review Button */}
        <Button onClick={() => setShowAddReview(!showAddReview)} className="mb-8">
          {showAddReview ? "Cancel" : "Add Your Review"}
        </Button>

        {/* Add Review Form */}
        {showAddReview && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-muted p-6 rounded-lg mb-8 space-y-4"
          >
            <div>
              <label className="block text-sm font-medium mb-2">Your Name</label>
              <input
                type="text"
                value={newReview.author}
                onChange={(e) => setNewReview({ ...newReview, author: e.target.value })}
                placeholder="Enter your name"
                className="w-full px-4 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Rating</label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => setNewReview({ ...newReview, rating: star })}
                    className="transition-transform hover:scale-110"
                  >
                    <Star
                      className={`w-6 h-6 ${
                        star <= newReview.rating ? "fill-yellow-400 text-yellow-400" : "text-gray-300"
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Your Review</label>
              <textarea
                value={newReview.comment}
                onChange={(e) => setNewReview({ ...newReview, comment: e.target.value })}
                placeholder="Share your experience with this product..."
                rows={4}
                className="w-full px-4 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <Button onClick={handleAddReview} className="w-full">
              Submit Review
            </Button>
          </motion.div>
        )}

        {/* Reviews List */}
        <div className="space-y-4">
          {allReviews.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No reviews yet. Be the first to review!</p>
          ) : (
            allReviews.map((review, index) => (
              <motion.div
                key={review.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="border border-border rounded-lg p-4"
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className="font-semibold">{review.author}</p>
                    <p className="text-sm text-muted-foreground">{review.date}</p>
                  </div>
                  <div className="flex gap-1">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        className={`w-4 h-4 ${i < review.rating ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`}
                      />
                    ))}
                  </div>
                </div>
                <p className="text-sm mb-3">{review.comment}</p>
                <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors">
                  <ThumbsUp className="w-4 h-4" />
                  Helpful ({review.helpful})
                </button>
              </motion.div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
