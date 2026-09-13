// Small app-wide display config, kept separate from supabaseClient.ts since
// none of this is a Supabase credential -- it's display strings and a login
// convention, and it's fine (expected, even) to fall back to sensible
// defaults if unset.

const rawShopName = import.meta.env.VITE_SHOP_NAME as string | undefined;

export const SHOP_NAME = rawShopName?.trim() || 'Uniform Shop';

// Supabase Auth has no native "username" concept -- every account is
// identified by an email address. To let staff log in with a plain username
// instead of a real email, Admin provisions each Supabase Auth user with a
// synthetic address of `<username>@LOGIN_EMAIL_DOMAIN` (see
// docs/screens-and-flows.md section 4), and the login screen appends this
// same domain to whatever the user types before calling
// supabase.auth.signInWithPassword. Not a real domain and never emailed --
// any syntactically valid value works, so the default only matters for
// looking sensible in the Supabase dashboard's user list.
const rawLoginEmailDomain = import.meta.env.VITE_LOGIN_EMAIL_DOMAIN as string | undefined;

export const LOGIN_EMAIL_DOMAIN = rawLoginEmailDomain?.trim() || 'login.local';
