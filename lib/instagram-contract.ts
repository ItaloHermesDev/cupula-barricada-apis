function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function textId(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

function boolOrNull(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function countOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function captionText(value: unknown) {
  if (typeof value === "string") return value;
  const record = asRecord(value);
  return typeof record?.text === "string" ? record.text : null;
}

function bestUrl(list: unknown) {
  if (!Array.isArray(list)) return null;
  let best = "";
  let width = -1;
  for (const item of list) {
    const record = asRecord(item);
    const url = typeof record?.url === "string" ? record.url : "";
    const candidateWidth = typeof record?.width === "number" ? record.width : 0;
    if (url && candidateWidth >= width) {
      best = url;
      width = candidateWidth;
    }
  }
  return best || null;
}

function imageUrl(media: Record<string, unknown>) {
  const fromCandidates = bestUrl(asRecord(media.image_versions2)?.candidates);
  if (fromCandidates) return fromCandidates;
  for (const key of ["display_uri", "display_url", "thumbnail_url", "image_url"]) {
    if (typeof media[key] === "string" && media[key]) return media[key];
  }
  return null;
}

function mediaOf(item: Record<string, unknown>) {
  return asRecord(item.node) ?? item;
}

function looksLikeMedia(item: Record<string, unknown>) {
  const media = mediaOf(item);
  return media.pk != null || media.code != null || media.image_versions2 != null || media.taken_at != null;
}

function mediaCard(item: Record<string, unknown>) {
  const media = mediaOf(item);
  const user = asRecord(media.user) ?? asRecord(media.owner) ?? {};
  const carousel = Array.isArray(media.carousel_media) ? media.carousel_media.length : null;
  const id = textId(media.id) ?? textId(media.pk);
  return {
    pk: textId(media.pk) ?? id,
    id,
    code: typeof media.code === "string" ? media.code : null,
    media_type: countOrNull(media.media_type),
    product_type: typeof media.product_type === "string" ? media.product_type : null,
    taken_at: countOrNull(media.taken_at),
    like_count: countOrNull(media.like_count),
    comment_count: countOrNull(media.comment_count),
    view_count: countOrNull(media.view_count),
    caption: captionText(media.caption),
    image_url: imageUrl(media),
    video_url: bestUrl(media.video_versions),
    username: typeof user.username === "string" ? user.username : null,
    user_id: textId(user.pk) ?? textId(user.id),
    full_name: typeof user.full_name === "string" ? user.full_name : null,
    carousel_media_count: countOrNull(media.carousel_media_count) ?? carousel,
  };
}

function looksLikeUser(item: Record<string, unknown>) {
  return typeof item.username === "string" || item.pk != null || item.id != null;
}

function userCard(item: Record<string, unknown>) {
  const source = asRecord(item.node) ?? item;
  const friendship = asRecord(source.friendship_status);
  const id = textId(source.id) ?? textId(source.pk);
  return {
    pk: textId(source.pk) ?? id,
    id,
    username: typeof source.username === "string" ? source.username : null,
    full_name: typeof source.full_name === "string" ? source.full_name : null,
    profile_pic_url: typeof source.profile_pic_url === "string" ? source.profile_pic_url : null,
    is_private: boolOrNull(source.is_private),
    is_verified: boolOrNull(source.is_verified),
    followed_by_viewer: boolOrNull(source.followed_by_viewer) ?? boolOrNull(friendship?.following),
    requested_by_viewer: boolOrNull(source.requested_by_viewer) ?? boolOrNull(friendship?.outgoing_request),
    social_context: typeof source.social_context === "string" ? source.social_context : null,
  };
}

function mapList(value: unknown, kind: "media" | "user") {
  if (!Array.isArray(value)) return value;
  const records = value.map(asRecord).filter((item): item is Record<string, unknown> => Boolean(item));
  const matches = kind === "media" ? records.some(looksLikeMedia) : records.some(looksLikeUser);
  if (!matches) return value;
  return value.map((item) => {
    const record = asRecord(item);
    if (!record) return item;
    if (kind === "media") return looksLikeMedia(record) ? mediaCard(record) : item;
    return looksLikeUser(record) ? userCard(record) : item;
  });
}

export function alignInstagramPayload(payload: unknown, slug: string) {
  if (!slug.startsWith("instagram-stable/") && !slug.startsWith("realtime-instagram/") && !slug.startsWith("instagram-best/")) return payload;
  const record = asRecord(payload);
  if (!record) return payload;
  const next = { ...record };
  if ("posts" in next) next.posts = mapList(next.posts, "media");
  if ("items" in next) next.items = mapList(next.items, "media");
  if ("users" in next) next.users = mapList(next.users, "user");
  if (typeof next.username === "string" && next.username && !("posts" in next) && !("users" in next) && !("items" in next)) {
    const pk = textId(next.pk);
    const id = textId(next.id) ?? pk;
    if (pk) next.pk = pk;
    if (id) next.id = id;
    const hd = asRecord(next.hd_profile_pic_url);
    if (hd && typeof hd.url === "string") next.hd_profile_pic_url = hd.url;
    if ((typeof next.profile_pic_url_hd !== "string" || !next.profile_pic_url_hd) && typeof next.hd_profile_pic_url === "string") {
      next.profile_pic_url_hd = next.hd_profile_pic_url;
    }
    next.error = null;
  }
  return next;
}
