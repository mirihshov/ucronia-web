import { createClient } from '@supabase/supabase-js';

// Cliente público (clave anon): RLS limita la lectura a libros publicados.
export const supabase = createClient(
  import.meta.env.PUBLIC_SUPABASE_URL,
  import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } },
);
