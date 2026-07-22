// Who counts as an admin.
//
// Group admin status is read live from Telegram rather than mirrored in our own
// roster: the village already manages the group's admins, and a second list to
// keep in sync would drift and then wrongly refuse someone mid-emergency.

import type { Api } from "grammy";

export async function isGroupAdmin(
  api: Api,
  chatId: number,
  userId: number,
): Promise<boolean> {
  try {
    const member = await api.getChatMember(chatId, userId);
    return member.status === "creator" || member.status === "administrator";
  } catch {
    // Not a member, or Telegram is unreachable. Deny the privilege, never the
    // alert — nothing on the alert path depends on this answer.
    return false;
  }
}

/** Display name as it will appear in the group: first name, or @username. */
export function displayName(
  user: { first_name?: string; last_name?: string; username?: string },
): string {
  const full = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  if (full) return full;
  return user.username ? `@${user.username}` : "?";
}
