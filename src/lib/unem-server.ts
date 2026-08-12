import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./unem-config";

export type AppRole = "admin" | "uploader" | "user";

export type AuthedCaller = { userId: string; email: string; role: AppRole };

/** استخراج التوكن من ترويسة الطلب */
function bearerFrom(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? (match[1] ?? null) : null;
}

/**
 * التحقق الحقيقي من الهوية والصلاحية:
 * 1) نتحقق من التوكن لدى Supabase Auth (وليس من البريد في الواجهة).
 * 2) نقرأ الدور من قاعدة البيانات عبر الدالة get_my_role() المحمية بـ RLS.
 */
export async function authenticateCaller(
  request: Request,
): Promise<{ caller: AuthedCaller } | { error: Response }> {
  const token = bearerFrom(request);
  if (!token) {
    return { error: json({ error: "غير مصرح: لا يوجد توكن جلسة." }, 401) };
  }

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!userRes.ok) {
    return { error: json({ error: "جلسة غير صالحة أو منتهية. سجّل الدخول مجدداً." }, 401) };
  }
  const user = (await userRes.json()) as { id?: string; email?: string };
  if (!user.id) {
    return { error: json({ error: "تعذر التحقق من الحساب." }, 401) };
  }

  const roleRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_my_role`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: "{}",
  });
  if (!roleRes.ok) {
    return { error: json({ error: "تعذر قراءة صلاحيات الحساب من قاعدة البيانات." }, 500) };
  }
  const raw = (await roleRes.json()) as unknown;
  const role: AppRole =
    raw === "admin" || raw === "uploader" ? raw : "user";

  return { caller: { userId: user.id, email: user.email ?? "", role } };
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/** توقيع Cloudinary (SHA-1 للمعاملات المرتبة + API secret) */
export async function signCloudinaryParams(
  params: Record<string, string>,
  apiSecret: string,
): Promise<string> {
  const toSign = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  const bytes = new TextEncoder().encode(toSign + apiSecret);
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function readCloudinaryEnv():
  | { cloudName: string; apiKey: string; apiSecret: string }
  | null {
  const cloudName = process.env["CLOUDINARY_CLOUD_NAME"];
  const apiKey = process.env["CLOUDINARY_API_KEY"];
  const apiSecret = process.env["CLOUDINARY_API_SECRET"];
  if (!cloudName || !apiKey || !apiSecret) return null;
  return { cloudName, apiKey, apiSecret };
}

/** يتحقق أن الرابط رابط Cloudinary حقيقي ومباشر (وليس JSON pointer أو رابط Supabase) */
export function isRealCloudinaryUrl(url: unknown): url is string {
  return (
    typeof url === "string" &&
    /^https:\/\/res\.cloudinary\.com\/[^/]+\/(raw|image|video)\/upload\//.test(url)
  );
}

/** يبني رابط تسليم Cloudinary مباشر انطلاقاً من public_id (للإصلاح عند غياب secure_url) */
export function buildCloudinaryUrl(
  cloudName: string,
  publicId: string,
  resourceType: string,
): string {
  const type = ["raw", "image", "video"].includes(resourceType) ? resourceType : "raw";
  const encoded = publicId.split("/").map(encodeURIComponent).join("/");
  return `https://res.cloudinary.com/${cloudName}/${type}/upload/${encoded}`;
}

/** يحوّل أي رابط Cloudinary مباشر إلى رابط تنزيل (مرفق) */
export function toCloudinaryDownloadUrl(url: string): string {
  if (url.includes("/upload/fl_attachment")) return url;
  return url.replace("/upload/", "/upload/fl_attachment/");
}

/**
 * المُوحِّد الوحيد لرمز المادة (subject_code) — يُستعمل في الواجهة والخادم وقاعدة البيانات
 * وفي مسار Cloudinary. مثال: "C#" → "c" ، "Analyse Financière" → "analyse_financiere".
 */
export function normalizeSubjectCode(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

/** يبني رابط ملف GitHub الخام انطلاقاً من المسار المخزَّن */
export function buildGithubRawUrl(
  owner: string,
  repo: string,
  branch: string,
  path: string,
): string {
  const clean = path.replace(/^"|"$/g, "").replace(/^\/+/, "");
  const encoded = clean.split("/").map(encodeURIComponent).join("/");
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${encoded}`;
}

export type DocumentRow = {
  id: string;
  name: string;
  cloudinary_url: string | null;
  cloudinary_public_id: string | null;
  cloudinary_resource_type: string | null;
  source: string;
};


/** يقرأ سجل المستند من قاعدة البيانات بصلاحيات صاحب الجلسة (RLS مفعّل) */
export async function fetchDocumentRow(
  documentId: string,
  token: string,
): Promise<DocumentRow | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/documents?id=eq.${encodeURIComponent(documentId)}` +
      `&select=id,name,cloudinary_url,cloudinary_public_id,cloudinary_resource_type,source&limit=1`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as DocumentRow[];
  return rows[0] ?? null;
}

/** يحذف سجل المستند من قاعدة البيانات بصلاحيات صاحب الجلسة (سياسة admins delete) */
export async function deleteDocumentRow(documentId: string, token: string): Promise<boolean> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/documents?id=eq.${encodeURIComponent(documentId)}`,
    {
      method: "DELETE",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        Prefer: "return=minimal",
      },
    },
  );
  return res.ok;
}

/** استخراج التوكن (مُصدَّر لاستعمال المسارات) */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? (match[1] ?? null) : null;
}

/* =====================================================================
   أنواع الملفات والمواد المشتركة — تُقرأ من قاعدة البيانات (لا شيء ثابت)
   ===================================================================== */

export type DocumentTypeRow = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  description?: string | null;
  is_default?: boolean;
};
export type CommonSubjectRow = {
  id: string;
  name: string;
  subject_code: string;
  level: string;
  semester: string;
  is_active: boolean;
};

async function restSelect<T>(path: string, token: string | null): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token ?? SUPABASE_ANON_KEY}`,
    },
  });
  if (!res.ok) return [];
  return (await res.json()) as T[];
}

/** أنواع الملفات المفعّلة (المرجع الوحيد — يديرها المشرف الرئيسي) */
export async function fetchActiveDocumentTypes(token: string | null): Promise<DocumentTypeRow[]> {
  return restSelect<DocumentTypeRow>(
    "document_types?select=id,name,slug,is_active&is_active=eq.true&order=sort_order.asc",
    token,
  );
}

/** المواد المشتركة المفعّلة (تظهر لجميع التخصصات) */
export async function fetchActiveCommonSubjects(token: string | null): Promise<CommonSubjectRow[]> {
  return restSelect<CommonSubjectRow>(
    "common_subjects?select=id,name,subject_code,level,semester,is_active&is_active=eq.true&order=sort_order.asc",
    token,
  );
}

/* =====================================================================
   أنواع الملفات المرتبطة بالمادة (Scope → Level → Semester → Subject)
   المرجع الوحيد: جدول subject_document_types + دالة التحقق في القاعدة.
   ===================================================================== */

export type SubjectScope = {
  scopeType: "specialization" | "common";
  specialization: string;
  level: string;
  semester: string;
  subjectCode: string;
};

/** صف الأنواع الفعّالة كما تُرجعه دالة قاعدة البيانات */
export type EffectiveTypeRow = {
  type_id: string;
  link_id: string | null;
  slug: string;
  base_name: string;
  name: string;
  description: string | null;
  sort_order: number | null;
  is_default: boolean;
  is_overridden: boolean;
  is_active: boolean;
};

/**
 * المصدر الوحيد لحساب أنواع الملفات الفعّالة لمادة واحدة:
 *   الأنواع الافتراضية + تخصيصات المادة − الأنواع المعطّلة لهذه المادة + الأنواع المخصصة.
 * تُستخدم في: واجهة الطالب، نموذج الرفع، لوحة المشرف، والتحقق على الخادم.
 */
export async function fetchEffectiveDocumentTypes(
  scope: SubjectScope,
  token: string | null,
  includeDisabled = false,
): Promise<EffectiveTypeRow[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/effective_document_types_for_subject`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token ?? SUPABASE_ANON_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      _scope: scope.scopeType,
      _spec: scope.specialization.toUpperCase(),
      _level: scope.level.toUpperCase(),
      _semester: scope.semester.toUpperCase(),
      _code: scope.subjectCode.toLowerCase(),
    }),
  });
  if (!res.ok) return [];
  const rows = (await res.json()) as EffectiveTypeRow[];
  return Array.isArray(rows) ? rows.filter((r) => includeDisabled || r.is_active) : rows;
}

/** أنواع الملفات الفعّالة لمادة واحدة بشكل DocumentTypeRow (توافق مع المستدعين الحاليين) */
export async function fetchSubjectDocumentTypes(
  scope: SubjectScope,
  token: string | null,
): Promise<DocumentTypeRow[]> {
  const rows = await fetchEffectiveDocumentTypes(scope, token, false);
  return rows.map((r) => ({
    id: r.type_id,
    name: r.name,
    slug: r.slug,
    is_active: true,
    description: r.description,
    is_default: r.is_default,
  }));
}

/** التحقق النهائي على الخادم: هل هذا النوع مرتبط فعلاً بهذه المادة؟ */
export async function isDocumentTypeAllowedForSubject(
  typeId: string,
  scope: SubjectScope,
  token: string | null,
): Promise<boolean> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/document_type_allowed_for_subject`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token ?? SUPABASE_ANON_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      _type_id: typeId,
      _scope: scope.scopeType,
      _spec: scope.specialization.toUpperCase(),
      _level: scope.level.toUpperCase(),
      _semester: scope.semester.toUpperCase(),
      _code: scope.subjectCode.toLowerCase(),
    }),
  });
  if (!res.ok) return false;
  return (await res.json()) === true;
}
