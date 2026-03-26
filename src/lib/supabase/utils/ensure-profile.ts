import type { SupabaseClient, User } from "@supabase/supabase-js"

type PublicSchema = "public"

export type EnsureProfileResult =
  | { status: "existing" }
  | { status: "created"; email?: string | null }
  | { status: "error"; message: string }

/**
 * Guarantee that the authenticated user has a matching row in `public.profiles`.
 * When the SQL trigger (handle_new_user) is missing or failed to run, the user
 * loses access to every RLS-protected table immediately after signing in.
 *
 * We run this on the server (middleware + diagnostics) to auto-heal projects
 * where the trigger was not deployed.
 */
export async function ensureProfileForUser(
  supabase: SupabaseClient<any, PublicSchema, any>,
  user: Pick<User, "id" | "email" | "user_metadata">
): Promise<EnsureProfileResult> {
  if (!user?.id) {
    return { status: "error", message: "Missing user id" }
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle()

  if (error && error.code !== "PGRST116") {
    return { status: "error", message: error.message }
  }

  if (data) {
    return { status: "existing" }
  }

  const fallbackName =
    (typeof user.user_metadata?.name === "string" && user.user_metadata?.name.trim()) ||
    user.email?.split("@")[0] ||
    "User"

  const { error: insertError } = await supabase
    .from("profiles")
    .insert({
      id: user.id,
      email: user.email ?? "",
      name: fallbackName,
      whatsapp: user.user_metadata?.whatsapp ?? "",
    })
    .single()

  if (insertError) {
    return { status: "error", message: insertError.message }
  }

  return { status: "created", email: user.email }
}


