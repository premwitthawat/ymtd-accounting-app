import { supabase } from "./supabaseClient";

// Edge functions here pack their human-readable (Thai) reason into the
// JSON error body, which supabase-js wraps behind error.context —
// without unwrapping, every failure surfaces as an unhelpful "Edge
// Function returned a non-2xx status code" toast.
export async function invokeFunction(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (!error) return { data };
  let message = error.message;
  try {
    const parsed = await error.context.json();
    if (parsed?.error) message = parsed.error;
  } catch {
    // non-JSON error body — keep the generic message
  }
  return { error: message };
}
