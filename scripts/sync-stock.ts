
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function syncStock() {
  console.log('Fetching products and inventory stock...');
  
  const { data: products, error: pError } = await supabase.from('products').select('id, name, stock');
  const { data: invStock, error: iError } = await supabase.from('inv_stock').select('product_id, quantity');
  
  if (pError || iError) {
    console.error('Error fetching data:', pError || iError);
    return;
  }
  
  console.log(`Found ${products.length} products and ${invStock.length} inventory records.`);
  
  for (const product of products) {
    const inv = invStock.find(i => i.product_id === product.id);
    if (!inv) {
      console.log(`Initializing inventory for ${product.name} with ${product.stock} units...`);
      await supabase.from('inv_stock').insert({
        product_id: product.id,
        quantity: product.stock || 0,
        low_stock_threshold: 5
      });
    } else if (inv.quantity !== product.stock) {
      console.log(`Syncing ${product.name}: Product Stock (${product.stock}) != Inventory (${inv.quantity}). Updating Inventory to ${product.stock}...`);
      await supabase.from('inv_stock').update({
        quantity: product.stock,
        updated_at: new Date().toISOString()
      }).eq('product_id', product.id);
    }
  }
  
  console.log('Sync complete!');
}

syncStock();
