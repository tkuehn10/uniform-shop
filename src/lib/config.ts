// Small app-wide display config, kept separate from supabaseClient.ts since
// this isn't a Supabase credential -- it's just a display string, and it's
// fine (expected, even) to fall back to a generic default if unset.

const rawShopName = import.meta.env.VITE_SHOP_NAME as string | undefined;

export const SHOP_NAME = rawShopName?.trim() || 'Uniform Shop';
