declare module "https://deno.land/std@0.190.0/http/server.ts" {
  export function serve(handler: (req: Request) => Response | Promise<Response>): void;
}

declare module "https://esm.sh/@supabase/supabase-js@2.45.0" {
  export type SupabaseClient = any;
  export function createClient(url: string, key: string): SupabaseClient;
}

declare const Deno: {
  env: {
    toObject(): Record<string, string>;
  };
};