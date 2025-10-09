/**
 * Ambient declarations to satisfy TypeScript when checking Deno-based Supabase Edge Functions
 * that import modules via URL and use the global Deno object.
 */

/* Global Deno declaration (minimal) */
declare const Deno: {
  env: {
    toObject(): Record<string, string>;
    get(name: string): string | undefined;
  };
};

/* Module declarations for URL imports used in edge functions */
declare module "https://deno.land/std@0.190.0/http/server.ts" {
  export function serve(
    handler: (req: Request) => Response | Promise<Response>,
    options?: { port?: number; hostname?: string }
  ): void;
}

declare module "https://esm.sh/@supabase/supabase-js@2.45.0" {
  export type SupabaseClient<T = any> = {
    auth: any;
    from: (table: string) => any;
    functions: {
      invoke: (name: string, opts?: any) => Promise<any>;
    };
  };
  export function createClient(url: string, key: string, opts?: any): SupabaseClient;
}