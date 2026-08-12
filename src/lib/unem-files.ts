/* =====================================================================
   أنواع الملفات المدعومة رسمياً — المرجع الوحيد على الخادم
   (يجب أن يبقى مطابقاً لـ public/unem-upload.js في الواجهة)
   ===================================================================== */

export type FileKind = "pdf" | "word" | "powerpoint" | "excel" | "image";

export type FileTypeInfo = {
  ext: string;
  mime: string;
  kind: FileKind;
  resourceType: "raw" | "image";
};

const TABLE: Record<string, Omit<FileTypeInfo, "ext">> = {
  pdf: { mime: "application/pdf", kind: "pdf", resourceType: "raw" },
  doc: { mime: "application/msword", kind: "word", resourceType: "raw" },
  docx: {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    kind: "word",
    resourceType: "raw",
  },
  ppt: { mime: "application/vnd.ms-powerpoint", kind: "powerpoint", resourceType: "raw" },
  pptx: {
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    kind: "powerpoint",
    resourceType: "raw",
  },
  xls: { mime: "application/vnd.ms-excel", kind: "excel", resourceType: "raw" },
  xlsx: {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    kind: "excel",
    resourceType: "raw",
  },
  jpg: { mime: "image/jpeg", kind: "image", resourceType: "image" },
  jpeg: { mime: "image/jpeg", kind: "image", resourceType: "image" },
  png: { mime: "image/png", kind: "image", resourceType: "image" },
};

export const SUPPORTED_EXTENSIONS = Object.keys(TABLE);

export function extensionOf(fileName: string): string {
  const match = /\.([A-Za-z0-9]+)$/.exec(String(fileName ?? ""));
  return match ? (match[1] ?? "").toLowerCase() : "";
}

/** يعيد وصف نوع الملف أو null إن كان غير مدعوم */
export function fileTypeInfo(fileName: string): FileTypeInfo | null {
  const ext = extensionOf(fileName);
  const entry = TABLE[ext];
  return entry ? { ext, ...entry } : null;
}

export function isSupportedFile(fileName: string): boolean {
  return fileTypeInfo(fileName) !== null;
}
