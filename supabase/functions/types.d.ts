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
      getBucket: (name: string) => Promise<{ data: any; error?: any }>;
      createBucket: (name: string, options: { public: boolean }) => Promise<{ data: any; error?: any }>;
      from: (bucket: string) => {
        upload: (
          path: string,
          body: Uint8Array | ArrayBuffer | Blob,
          options?: { contentType?: string; upsert?: boolean }
        ) => Promise<{ data: any; error?: any }>;
        createSignedUrl: (
          path: string,
          expiresIn: number
        ) => Promise<{ data: { signedUrl: string } | null; error?: any }>;
        remove: (paths: string[]) => Promise<{ data: any; error?: any }>;
      };
    };
  };
  export function createClient(url: string, key: string, opts?: any): SupabaseClient;
}