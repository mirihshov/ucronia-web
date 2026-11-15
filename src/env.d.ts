/// <reference types="astro/client" />
declare namespace App {
  interface Locals {
    admin?: { client: import('@supabase/supabase-js').SupabaseClient; email: string };
  }
}
