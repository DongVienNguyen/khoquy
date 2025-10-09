/* Type declarations for Deno-based Supabase Edge Functions to satisfy TypeScript in the Next.js project build. */

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
    storage: {
      getBucket: (bucket: string) => Promise<{ data: any; error: any }>;
      createBucket: (bucket: string, opts?: any) => Promise<{ data: any; error: any }>;
      from: (bucket: string) => {
        list: (path?: string, options?: any) => Promise<{ data: any[]; error: any }>;
        upload: (path: string, body: any, options?: any) => Promise<{ data: any; error: any }>;
        remove: (paths: string[]) => Promise<{ data: any; error: any }>;
      };
    };
  };
  export function createClient(url: string, key: string, opts?: any): SupabaseClient;
}