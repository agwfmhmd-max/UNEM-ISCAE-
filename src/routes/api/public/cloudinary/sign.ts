import { createFileRoute } from "@tanstack/react-router";
import {
  authenticateCaller,
  bearerToken,
  fetchActiveCommonSubjects,
  fetchSubjectDocumentTypes,
  isDocumentTypeAllowedForSubject,
  json,
  normalizeSubjectCode,
  readCloudinaryEnv,
  signCloudinaryParams,
} from "@/lib/unem-server";
import { fileTypeInfo } from "@/lib/unem-files";
import { isLevelSemesterValid, semestersForLevel, subjectsFor } from "@/lib/unem-subjects";

const SPECS = ["BA", "FC", "TCM", "GRH", "SAE", "IG", "COMMON"];
const LEVELS = ["L1", "L2", "L3"];
const SEMESTERS = ["S1", "S2", "S3", "S4", "S5", "S6"];
const MAX_SIZE = 60 * 1024 * 1024; // 60 MB


export const Route = createFileRoute("/api/public/cloudinary/sign")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticateCaller(request);
        if ("error" in auth) return auth.error;
        const { caller } = auth;
        const token = bearerToken(request);

        if (caller.role !== "admin" && caller.role !== "uploader") {
          return json({ error: "❌ ليس لديك صلاحية لرفع الملفات." }, 403);
        }

        const env = readCloudinaryEnv();
        if (!env) {
          return json({ error: "❌ إعدادات Cloudinary غير مكتملة على الخادم." }, 500);
        }

        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return json({ error: "❌ طلب غير صالح." }, 400);
        }

        const fileName = String(body["fileName"] ?? "");
        const fileSize = Number(body["fileSize"] ?? 0);
        const section = String(body["section"] ?? "documents").toLowerCase();

        // نوع الملف الفعلي (PDF / Word / PowerPoint / Excel / صورة)
        const typeInfo = fileTypeInfo(fileName);
        if (!typeInfo) {
          return json(
            { error: "❌ نوع الملف غير مدعوم. المسموح: PDF, Word, PowerPoint, Excel, JPG, PNG." },
            400,
          );
        }
        if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_SIZE) {
          return json({ error: "❌ حجم الملف غير صالح (الحد الأقصى 60 ميغابايت)." }, 400);
        }

        const baseFileName =
          normalizeSubjectCode(fileName.replace(/\.[A-Za-z0-9]+$/, "")) || "document";
        const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        /** يبني الاستجابة النهائية بعد اعتماد المجلد */
        async function buildSignature(folder: string, prefix: string) {
          const cloudinary = readCloudinaryEnv()!;
          const publicId = `${prefix}_${baseFileName}_${uniqueSuffix}.${typeInfo!.ext}`;
          const timestamp = Math.floor(Date.now() / 1000).toString();
          const signature = await signCloudinaryParams(
            { folder, public_id: publicId, timestamp },
            cloudinary.apiSecret,
          );
          return {
            cloudName: cloudinary.cloudName,
            apiKey: cloudinary.apiKey,
            timestamp,
            signature,
            folder,
            publicId,
            resourceType: typeInfo!.resourceType,
            extension: typeInfo!.ext,
            mimeType: typeInfo!.mime,
            fileKind: typeInfo!.kind,
            uploadUrl: `https://api.cloudinary.com/v1_1/${cloudinary.cloudName}/${typeInfo!.resourceType}/upload`,
          };
        }

        /* ---------------------------------------------------------------
           قسم النتائج (Résultats): لا يعتمد على المواد ولا أنواع المستندات.
           admin و uploader فقط (تم التحقق أعلاه).
           --------------------------------------------------------------- */
        if (section === "results") {
          const academicYear = String(body["academicYear"] ?? "").trim();
          const major = String(body["major"] ?? "").trim().toUpperCase();
          const resLevel = String(body["level"] ?? "").trim().toUpperCase();
          const resSemester = String(body["semester"] ?? "").trim().toUpperCase();
          if (!/^\d{4}-\d{4}$/.test(academicYear)) {
            return json({ error: "❌ السنة الجامعية غير صالحة (مثال: 2024-2025)." }, 400);
          }
          if (!/^[A-Z0-9_]{1,20}$/.test(major)) {
            return json({ error: "❌ التخصص غير صالح." }, 400);
          }
          if (resLevel && !/^[A-Z0-9_]{1,10}$/.test(resLevel)) {
            return json({ error: "❌ المستوى غير صالح." }, 400);
          }
          if (resSemester && !/^[A-Z0-9_]{1,10}$/.test(resSemester)) {
            return json({ error: "❌ الفصل غير صالح." }, 400);
          }
          const folder = [
            "UNEM_ISCAE/RESULTS",
            academicYear,
            major,
            resLevel || "ALL",
            resSemester || "ALL",
          ].join("/");
          return json({
            ...(await buildSignature(folder, "result")),
            section: "results",
            academicYear,
            major,
            level: resLevel,
            semester: resSemester,
          });
        }

        const specialization = String(body["specialization"] ?? "").toUpperCase();
        const level = String(body["level"] ?? "").toUpperCase();
        const semester = String(body["semester"] ?? "").toUpperCase();
        const subjectName = String(body["subject"] ?? "").trim();
        const subjectCode = normalizeSubjectCode(subjectName || String(body["subjectCode"] ?? ""));
        const fileTypeSlug = String(body["fileTypeSlug"] ?? body["fileType"] ?? "").trim();


        if (!SPECS.includes(specialization)) return json({ error: "❌ تخصص غير صالح." }, 400);
        if (!LEVELS.includes(level)) return json({ error: "❌ مستوى غير صالح." }, 400);
        if (!SEMESTERS.includes(semester)) return json({ error: "❌ فصل غير صالح." }, 400);
        if (!isLevelSemesterValid(level, semester)) {
          return json(
            {
              error: `❌ الفصل ${semester} لا ينتمي إلى المستوى ${level}. المسموح لهذا المستوى: ${semestersForLevel(level).join(" / ")}.`,
            },
            400,
          );
        }
        if (!subjectCode) return json({ error: "❌ يجب اختيار المادة." }, 400);

        // المواد المشتركة تُقرأ من قاعدة البيانات (لا استثناءات ثابتة في الكود)
        const commonSubjects = await fetchActiveCommonSubjects(token);
        const commonMatch = commonSubjects.find(
          (c) =>
            normalizeSubjectCode(c.subject_code) === subjectCode &&
            c.level.toUpperCase() === level &&
            c.semester.toUpperCase() === semester,
        );

        const isCommon = specialization === "COMMON" || !!commonMatch;
        if (isCommon && !commonMatch) {
          return json({ error: "❌ المادة المختارة ليست مادة مشتركة صالحة." }, 400);
        }

        if (!isCommon) {
          const allowedSubjects = subjectsFor(specialization, semester);
          const matched = allowedSubjects.find((s) => normalizeSubjectCode(s) === subjectCode);
          if (!matched) {
            return json(
              { error: `❌ المادة المختارة غير موجودة ضمن ${specialization} / ${semester}.` },
              400,
            );
          }
        }

        const scopeFolder = isCommon ? "COMMON" : specialization;
        const scope = {
          scopeType: (isCommon ? "common" : "specialization") as "common" | "specialization",
          specialization: scopeFolder,
          level,
          semester,
          subjectCode,
        };

        // نوع الملف: مرتبط بهذه المادة فقط (subject_document_types) — لا أنواع عامة
        const types = await fetchSubjectDocumentTypes(scope, token);
        const type = types.find(
          (t) => t.slug === fileTypeSlug || t.name === fileTypeSlug || t.id === fileTypeSlug,
        );
        if (!type) {
          return json(
            {
              error:
                "❌ نوع الملف غير مرتبط بهذه المادة أو غير مفعّل. اطلب من المشرف الرئيسي إعداد أنواع الملفات لهذه المادة.",
            },
            400,
          );
        }

        // تحقق نهائي مستقل في قاعدة البيانات (لا نثق بأي بيانات من الواجهة)
        const allowed = await isDocumentTypeAllowedForSubject(type.id, scope, token);
        if (!allowed) {
          return json({ error: "❌ نوع الملف المحدد لا يخص المادة المختارة." }, 403);
        }

        const folder = `UNEM_ISCAE/${scopeFolder}/${level}/${semester}/${subjectCode}/${type.slug}`;

        return json({
          ...(await buildSignature(folder, type.slug)),
          section: "documents",
          scopeType: isCommon ? "common" : "specialization",
          specialization: scopeFolder,
          fileTypeId: type.id,
          fileTypeName: type.name,
          fileTypeSlug: type.slug,
        });

      },
    },
  },
});
