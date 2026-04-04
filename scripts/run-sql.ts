
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables (VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runSql() {
  const sql = process.argv[2];
  if (!sql) {
    console.error('Please provide SQL as the first argument');
    process.exit(1);
  }

  console.log(`Executing SQL: ${sql}`);
  
  // NOTE: Supabase JS client doesn't have a direct 'sql' method.
  // We usually use RPC if we have a function named 'exec_sql'.
  // As a fallback, we'll try to use the REST API via a generic table check if possible.
  
  try {
    if (sql.toLowerCase().includes('select count(*) from admins')) {
        const { count, error } = await supabase.from('admins').select('*', { count: 'exact', head: true });
        if (error) throw error;
        console.log(`Admins Count: ${count}`);
    } else if (sql.toLowerCase().includes('select * from admins')) {
        const { data, error } = await supabase.from('admins').select('*');
        if (error) throw error;
        console.log('Admins:', data);
    } else {
        console.log('Generic SQL execution via Supabase JS client is restricted to RPC or specific table methods.');
        console.log('Trying as RPC call if exec_sql exists...');
        const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
        if (error) console.error('RPC Error (exec_sql likely missing):', error.message);
        else console.log('Result:', data);
    }
  } catch (err: any) {
    console.error('Execution Error:', err.message);
  }
}

runSql();
