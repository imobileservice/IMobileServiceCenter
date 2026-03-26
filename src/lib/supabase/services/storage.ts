import { createClient } from '../client'

export const storageService = {
  // Upload product image (with optional productId for existing products)
  async uploadProductImage(file: File, productId?: string): Promise<string> {
    const supabase = createClient()
    const fileExt = file.name.split('.').pop()
    const timestamp = Date.now()
    const randomStr = Math.random().toString(36).substring(2, 9)
    // Use productId if provided, otherwise use temporary identifier
    const fileName = productId 
      ? `${productId}-${timestamp}.${fileExt}`
      : `temp-${timestamp}-${randomStr}.${fileExt}`
    const filePath = `products/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from('product-images')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      })

    if (uploadError) {
      // Provide helpful error message for common issues
      if (uploadError.message?.includes('Bucket not found') || uploadError.message?.includes('not found')) {
        throw new Error(
          'Storage bucket "product-images" not found. Please create it in your Supabase dashboard:\n' +
          '1. Go to Storage in Supabase dashboard\n' +
          '2. Click "New bucket"\n' +
          '3. Name: "product-images"\n' +
          '4. Make it Public (uncheck "Private bucket")\n' +
          '5. Set file size limit: 5 MB\n' +
          '6. Set allowed MIME types: image/jpeg, image/png, image/webp'
        )
      }
      throw uploadError
    }

    // Get public URL
    const { data } = supabase.storage
      .from('product-images')
      .getPublicUrl(filePath)

    return data.publicUrl
  },

  // Delete product image
  async deleteProductImage(filePath: string) {
    const supabase = createClient()
    const { error } = await supabase.storage
      .from('product-images')
      .remove([filePath])

    if (error) throw error
  },

  // Upload avatar
  async uploadAvatar(file: File, userId: string): Promise<string> {
    const supabase = createClient()
    const fileExt = file.name.split('.').pop()
    const fileName = `${userId}-${Date.now()}.${fileExt}`
    const filePath = `avatars/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      })

    if (uploadError) throw uploadError

    // Get public URL
    const { data } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath)

    return data.publicUrl
  },

  // Delete avatar
  async deleteAvatar(filePath: string) {
    const supabase = createClient()
    const { error } = await supabase.storage
      .from('avatars')
      .remove([filePath])

    if (error) throw error
  },
}
