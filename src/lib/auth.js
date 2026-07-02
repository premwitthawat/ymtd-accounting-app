import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

export function useAuth() {
  const [session, setSession] = useState(undefined); // undefined = still checking, null = logged out
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => setSession(newSession));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setProfile(null);
      return;
    }
    supabase
      .from("public_profiles")
      .select("*")
      .eq("id", session.user.id)
      .single()
      .then(({ data }) => setProfile(data ?? null));
  }, [session]);

  const login = useCallback(async (username, pin) => {
    const email = `${username.trim().toLowerCase()}@ymtd.internal`;
    const { error } = await supabase.auth.signInWithPassword({ email, password: pin });
    return { error };
  }, []);

  const logout = useCallback(() => supabase.auth.signOut(), []);

  return { session, profile, loading: session === undefined, login, logout };
}
