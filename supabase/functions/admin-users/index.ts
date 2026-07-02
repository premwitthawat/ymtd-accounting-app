// Owner/manager-only user administration: list / create / reset-pin / set-active.
// Runs with the service_role key (never exposed to the browser) because
// creating/editing auth.users requires elevated privileges no client role
// should ever have. Every request is re-checked against the caller's own
// profile row below — a valid JWT alone only proves *someone* is logged
// in, not that they're allowed to manage accounts.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const PIN_RE = /^\d{6,}$/;
const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;
const ROLES = ["owner", "manager", "employee"];

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  if (!jwt) return json({ error: "Missing auth" }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: callerAuth, error: callerAuthErr } = await admin.auth.getUser(jwt);
  if (callerAuthErr || !callerAuth.user) return json({ error: "Invalid session" }, 401);

  const { data: callerProfile, error: callerProfileErr } = await admin
    .from("profiles")
    .select("role, active")
    .eq("id", callerAuth.user.id)
    .single();
  if (callerProfileErr || !callerProfile?.active || !["owner", "manager"].includes(callerProfile.role)) {
    return json({ error: "Forbidden — owner/manager only" }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const action = body.action;

  if (action === "list") {
    const { data, error } = await admin.from("profiles").select("id, username, role, label, active, created_at").order("created_at");
    if (error) return json({ error: error.message }, 400);
    return json({ users: data });
  }

  if (action === "create") {
    const role = String(body.role ?? "");
    const label = String(body.label ?? "").trim();
    const username = String(body.username ?? "").trim().toLowerCase();
    const pin = String(body.pin ?? "");
    if (!ROLES.includes(role)) return json({ error: "Invalid role" }, 400);
    if (!label) return json({ error: "Label is required" }, 400);
    if (!USERNAME_RE.test(username)) {
      return json({ error: "ID ต้องเป็นตัวอักษรเล็ก/ตัวเลข 3-20 ตัว (a-z, 0-9, _, .)" }, 400);
    }
    if (!PIN_RE.test(pin)) return json({ error: "PIN must be at least 6 digits" }, 400);

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: `${username}@ymtd.internal`,
      password: pin,
      email_confirm: true,
    });
    if (createErr || !created.user) {
      const msg = createErr?.message?.includes("already been registered") ? "ID นี้ถูกใช้แล้ว" : createErr?.message ?? "Failed to create user";
      return json({ error: msg }, 400);
    }

    const { error: insertErr } = await admin.from("profiles").insert({ id: created.user.id, role, label, username });
    if (insertErr) {
      await admin.auth.admin.deleteUser(created.user.id);
      return json({ error: insertErr.message }, 400);
    }

    return json({ id: created.user.id, role, label, username });
  }

  if (action === "reset-pin") {
    const id = String(body.id ?? "");
    const pin = String(body.pin ?? "");
    if (!id) return json({ error: "Missing id" }, 400);
    if (!PIN_RE.test(pin)) return json({ error: "PIN must be at least 6 digits" }, 400);

    const { error } = await admin.auth.admin.updateUserById(id, { password: pin });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  if (action === "set-active") {
    const id = String(body.id ?? "");
    const active = Boolean(body.active);
    if (!id) return json({ error: "Missing id" }, 400);

    const { error: profileErr } = await admin.from("profiles").update({ active }).eq("id", id);
    if (profileErr) return json({ error: profileErr.message }, 400);

    // Belt-and-suspenders: `active` gates writes via RLS once Milestone 3
    // lands, but a ban also invalidates the session faster than waiting
    // for the ~1hr JWT expiry.
    const { error: banErr } = await admin.auth.admin.updateUserById(id, {
      ban_duration: active ? "none" : "876000h",
    });
    if (banErr) return json({ error: banErr.message }, 400);

    return json({ ok: true });
  }

  return json({ error: "Unknown action" }, 400);
});
