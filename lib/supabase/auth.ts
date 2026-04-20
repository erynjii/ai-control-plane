import { supabase } from "@/lib/supabase/client";

export async function requestMagicLink(email: string) {
  return supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: typeof window !== "undefined" ? `${window.location.origin}/dashboard` : undefined
    }
  });
}

export async function getCurrentUser() {
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  return { user, error };
}

export async function signOut() {
  return supabase.auth.signOut();
}
