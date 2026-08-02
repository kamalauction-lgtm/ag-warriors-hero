/* Supabase client — ag-warriors-hero. Live once VITE_SUPABASE_ANON_KEY is set;
   until then the app keeps its local mock mode. */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseReady =
  !!url && !!key && key !== 'PASTE_ANON_KEY_HERE'

export const supabase: SupabaseClient | null = supabaseReady
  ? createClient(url!, key!)
  : null
