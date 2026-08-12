# UNEM ISCAE Hub

أريد منك تطوير المشروع الحالي المرفق، وهو موقع UNEM ISCAE موجود حالياً في ملف "index.html".



⚠️ تعليمات مهمة جداً قبل البدء



لا تبدأ ببناء موقع جديد من الصفر.



أولاً قم بتحليل المشروع الحالي بالكامل وفهم:



- تصميم الموقع.

- الأقسام.

- التخصصات.

- المستويات.

- الفصول.

- المواد.

- نظام عرض الملفات.

- نظام البحث والتصفية.

- نظام تسجيل الدخول.

- لوحة الإدارة.

- نظام GitHub الحالي.

- نظام Supabase الحالي.

- نظام رفع الملفات الحالي.

- قارئ PDF.

- Analytics.

- الإعلانات.

- أي وظائف أخرى موجودة.



بعد ذلك قم بتطوير المشروع مع الحفاظ على جميع الوظائف الحالية والتصميم الحالي قدر الإمكان.



الهدف هو تطوير النظام وليس تدميره أو استبداله بنموذج تجريبي.



---



🎯 الهدف الرئيسي



أريد تحويل نظام تخزين الملفات في منصة UNEM ISCAE إلى نظام احترافي وسريع وقابل للتوسع.



حالياً توجد ملفات يتم التعامل معها من:



- GitHub

- Supabase Storage



لكنني لا أريد الاعتماد على GitHub للملفات الجديدة، ولا أريد استهلاك مساحة Supabase Storage المجانية للملفات.



لذلك النظام الجديد يجب أن يكون:



Cloudinary

    ↓

تخزين ملفات PDF



و:



Supabase

    ↓

Database

Authentication

Roles

Permissions

File Metadata

Analytics



أي أن Cloudinary يخزن الملف نفسه، بينما Supabase يخزن بيانات الملف والرابط الخاص به.



---



🏗️ البنية الجديدة



اجعل النظام بهذا الشكل:



                    UNEM ISCAE

                        │

                        ▼

                 Supabase Auth

                        │

             ┌──────────┴──────────┐

             │                     │

            User              Admin/Uploader

             │                     │

             ▼                     ▼

      مشاهدة الملفات          لوحة الإدارة

                                   │

                                   ▼

                              رفع PDF

                                   │

                                   ▼

                              Cloudinary

                                   │

                         secure_url + public_id

                                   │

                                   ▼

                            Supabase Database

                                   │

                                   ▼

                          عرض الملفات للمستخدم



---



👥 نظام المستخدمين والصلاحيات



أريد نظام Roles حقيقي باستخدام Supabase.



الأدوار:



admin

uploader

user



👑 المشرف الرئيسي



البريد الإلكتروني للمشرف الرئيسي هو:



agwfmhmd@gmail.com



هذا الحساب يجب أن يحصل على Role:



admin



ويملك جميع الصلاحيات.



صلاحيات المشرف الرئيسي:



- رفع الملفات.

- حذف الملفات.

- تعديل بيانات الملفات.

- مشاهدة جميع الملفات.

- إدارة الملفات.

- إدارة المشرفين.

- إدارة صلاحيات المستخدمين.

- إدارة الإعلانات.

- مشاهدة Analytics.

- إدارة إعدادات المنصة.

- الوصول إلى جميع وظائف لوحة الإدارة.



---



👨‍💼 المشرفون الآخرون



البريد الإلكتروني:



unem-iscae@gmail.com



هذا الحساب يحصل على Role:



uploader



ويستطيع:



- تسجيل الدخول.

- فتح لوحة الرفع.

- اختيار التخصص.

- اختيار المستوى.

- اختيار الفصل.

- اختيار المادة.

- اختيار نوع الملف.

- رفع ملفات PDF.

- مشاهدة الملفات.

- معرفة حالة عمليات الرفع.



لكن لا يستطيع:



- حذف الملفات.

- إدارة المستخدمين.

- تغيير الصلاحيات.

- إدارة إعدادات الموقع الحساسة.

- إدارة المشرف الرئيسي.

- حذف بيانات النظام.

- الوصول إلى وظائف admin فقط.



---



👤 المستخدم العادي



أي مستخدم مسجل أو زائر عادي يجب أن يكون:



user



أو يمتلك صلاحيات القراءة فقط حسب النظام الحالي.



يستطيع:



- تصفح الموقع.

- اختيار التخصص.

- اختيار المستوى.

- اختيار الفصل.

- اختيار المادة.

- مشاهدة الملفات.

- فتح PDF.

- تحميل الملفات.



ولا يستطيع:



- رفع ملفات.

- حذف ملفات.

- تعديل ملفات.

- إدارة الموقع.



---



🔐 الأمان والصلاحيات



مهم جداً:



لا تعتمد فقط على البريد الإلكتروني في JavaScript الخاص بالواجهة.



لا تستخدم شيئاً مثل:



if (email === "agwfmhmd@gmail.com") {

   // admin

}



كآلية حماية وحيدة.



يجب أن تكون الصلاحيات محفوظة ومتحققاً منها في Supabase.



استخدم:



- Supabase Auth.

- Roles table.

- RLS.

- Secure policies.

- Server/Edge Functions عند الحاجة.



يمكن استخدام البريد الإلكتروني لتعيين Role أثناء إنشاء/تهيئة الحساب، لكن التحقق الحقيقي من الصلاحية يجب أن يكون server-side / database-side.



---



🗄️ Supabase Database



أنشئ جدولاً احترافياً للملفات:



documents



ويحتوي على الأقل على:



id

name

original_name

cloudinary_url

cloudinary_public_id

specialization

level

semester

subject

subject_code

file_type

mime_type

file_size

uploaded_by

created_at

updated_at



ويفضل إضافة:



cloudinary_resource_type

folder

status



عند الحاجة.



---



🔑 Roles Database



أنشئ نظام Roles واضحاً.



مثلاً:



user_roles



بحيث يكون:



agwfmhmd@gmail.com

→ admin



و:



unem-iscae@gmail.com

→ uploader



ولا تسمح للمستخدم العادي بالحصول على هذه الصلاحيات من الواجهة.



---



🛡️ RLS



فعّل Row Level Security.



المنطق المطلوب:



user

    SELECT



uploader

    SELECT

    INSERT



admin

    SELECT

    INSERT

    UPDATE

    DELETE



ويجب أن يتم التحقق من Role داخل Supabase وليس فقط داخل React/JavaScript.



أريد SQL Migration كامل لإنشاء:



- documents

- user_roles

- indexes

- RLS

- policies

- functions اللازمة



---



☁️ Cloudinary



استخدم Cloudinary لتخزين جميع ملفات PDF الجديدة.



لا تخزن PDF داخل Supabase Storage.



يجب أن يكون:



PDF

 ↓

Cloudinary

 ↓

secure_url

 ↓

Supabase documents



---



🚨 أمان Cloudinary



ممنوع تماماً وضع:



CLOUDINARY_API_SECRET



داخل:



index.html



أو:



React frontend



أو أي JavaScript يتم إرساله إلى المتصفح.



يجب أن يبقى:



CLOUDINARY_API_SECRET



في:



Supabase Edge Function



أو Server-side API.



---



🔐 Environment Variables



استخدم Environment Variables.



مثلاً:



SUPABASE_URL=

SUPABASE_ANON_KEY=



CLOUDINARY_CLOUD_NAME=

CLOUDINARY_API_KEY=

CLOUDINARY_API_SECRET=



لكن:



لا تضع Cloudinary API Secret في Frontend.



أنشئ أيضاً:



.env.example



بدون أي أسرار حقيقية.



---



📤 نظام رفع الملفات



أريد الاحتفاظ بطريقة الرفع الحالية في الموقع.



يجب أن يستطيع المشرف اختيار:



التخصص

↓

المستوى

↓

الفصل

↓

المادة

↓

نوع الملف

↓

اختيار PDF



ثم:



[ بدء الرفع ]



---



📁 Multiple Upload



يجب دعم رفع عدة ملفات في نفس الوقت.



مثلاً:



Cours_Comptabilite.pdf

TD_Comptabilite.pdf

Examen_Comptabilite.pdf

Resume_Comptabilite.pdf



ويظهر لكل ملف:



اسم الملف

حجم الملف

Progress

الحالة



مثلاً:



📄 Cours_Comptabilite.pdf



██████████████████░░ 90%



Uploading...



ثم:



✅ تم الرفع بنجاح



---



🖱️ Drag & Drop



أضف Drag & Drop للملفات إن كان مناسباً للتصميم.



مثلاً:



┌───────────────────────────────┐

│                               │

│       📁 اسحب ملفات PDF هنا   │

│                               │

│             أو                │

│                               │

│       [ اختيار الملفات ]      │

│                               │

└───────────────────────────────┘



---



📊 معلومات الملف



قبل الرفع أظهر:



اسم الملف

حجم الملف

نوع الملف



وبعد الرفع:



Cloudinary

↓

secure_url

↓

public_id

↓

Supabase



---



🗜️ ضغط PDF



إذا كان من الممكن ضغط PDF بأمان قبل رفعه، قم بتحسين حجمه.



مثلاً:



الحجم الأصلي:

15 MB



الحجم بعد التحسين:

9 MB



تم توفير:

40%



لكن لا تستخدم ضغطاً يؤدي إلى:



- تلف PDF.

- فقدان الصفحات.

- انخفاض جودة النص بشكل كبير.

- فشل الرفع.



إذا كان الضغط داخل المتصفح غير موثوق، ارفع الملف مباشرة أو نفذ المعالجة server-side.



---



📂 تنظيم Cloudinary



استخدم Folder Structure منظمة.



مثلاً:



UNEM_ISCAE/

    BA/

        L1/

            S1/

                COMPTABILITE/

                    Cours/

                    TD_TP/

                    Devoir/

                    Examen/



ويمكن استخدام:



specialization

level

semester

subject_code

file_type



لإنشاء المسار.



لكن لا تعتمد على Folder فقط لتحديد بيانات الملف.



بيانات الملف الأساسية يجب أن تكون في Supabase.



---



🧾 مثال



إذا رفع المشرف:



Cours Comptabilité.pdf



وكان:



التخصص: BA

المستوى: L1

الفصل: S1

المادة: Comptabilité

النوع: Cours



يجب أن تكون النتيجة:



Cloudinary

    ↓

PDF

    ↓

secure_url

    ↓

Supabase



name:

Cours Comptabilité.pdf



specialization:

BA



level:

L1



semester:

S1



subject:

Comptabilité



file_type:

Cours



uploaded_by:

UUID



---



🗑️ حذف الملفات



إذا قام:



admin



بحذف ملف:



يجب تنفيذ:



Admin

 ↓

Delete document

 ↓

Delete Cloudinary asset

 ↓

Delete Supabase record



لا تحذف سجل Supabase فقط وتترك الملف في Cloudinary.



أما:



uploader



فلا يظهر له زر Delete.



---



🔄 الملفات القديمة



الموقع الحالي يحتوي على ملفات GitHub وSupabase Storage.



لا تحذف النظام القديم مباشرة.



أريد نظاماً انتقالياً يدعم:



source:

github

supabase

cloudinary



مثلاً:



file.source



بحيث:



github

→ GitHub URL



supabase

→ Supabase Storage URL



cloudinary

→ Cloudinary URL



بهذه الطريقة يستمر الموقع في العمل أثناء نقل الملفات القديمة.



بعد نجاح النظام الجديد، يمكن إزالة الاعتماد على GitHub وSupabase Storage تدريجياً.



---



⚡ الأداء



أريد أن يكون الموقع سريعاً.



لا تقم بتحميل ملفات PDF عند فتح الموقع.



حمّل فقط Metadata من Supabase.



مثلاً:



BA

→ L1

→ S1

→ Comptabilité



ثم اطلب فقط الملفات الخاصة بهذه المادة.



استخدم:



- Database indexes.

- Pagination إذا لزم.

- Lazy loading.

- Caching.

- Queries محددة.

- عدم تحميل PDF قبل فتحه.



---



🔎 البحث



أضف/حافظ على البحث عن:



- اسم الملف.

- المادة.

- نوع الملف.



ويجب أن يعتمد البحث على Metadata في Supabase وليس تحميل جميع ملفات PDF.



---



📖 PDF Viewer



حافظ على قارئ PDF الحالي في الموقع.



عند فتح ملف Cloudinary:



Supabase

↓

cloudinary_url

↓

PDF Viewer



ولا تمرر المستخدم عبر GitHub للملفات الجديدة.



---



⬇️ Download



زر التحميل يستخدم:



cloudinary_url



للملفات الجديدة.



---



📊 Analytics



لا تحذف Analytics الموجود حالياً.



حافظ على تسجيل:



زيارة الموقع

فتح ملف

تحميل ملف

فتح تخصص

فتح مستوى

فتح فصل



ويمكن إضافة:



upload_file

delete_file



للمشرفين.



---



👨‍💻 لوحة الإدارة



أريد تطوير لوحة الإدارة الحالية دون تغيير تصميمها جذرياً.



يجب أن يرى:



Admin



لوحة التحكم



إجمالي الملفات

ملفات اليوم

عدد المشرفين

عدد المستخدمين

عمليات الرفع



ثم:



إدارة الملفات

إدارة المشرفين

الإعلانات

Analytics

إعدادات الموقع



Uploader



يرى فقط:



رفع الملفات

ملفاتي/الملفات المتاحة

حالة الرفع



ولا يرى أدوات الإدارة الحساسة.



---



👑 المشرف الرئيسي



عند تسجيل الدخول بالحساب:



agwfmhmd@gmail.com



يجب أن تظهر له جميع أدوات الإدارة.



Role:



admin



---



👨‍💼 المشرف الرافع



عند تسجيل الدخول بالحساب:



unem-iscae@gmail.com



Role:



uploader



وتظهر له واجهة رفع الملفات فقط والصلاحيات التي يحتاجها.



---



🚫 لا تسمح بتصعيد الصلاحيات



يجب ألا يستطيع uploader تغيير نفسه إلى:



admin



من Frontend.



ويجب ألا يستطيع إنشاء Admin جديد من الواجهة إلا إذا كان Admin مخولاً بذلك.



---



🔒 حماية الحسابات



استخدم Supabase Auth.



لا تعتمد على:



localStorage



كوسيلة مصادقة.



ولا تخزن كلمات المرور بنفسك.



---



🎨 التصميم



حافظ على هوية UNEM ISCAE الحالية.



لا تجعل لوحة الإدارة تبدو كتطبيق مختلف تماماً.



حافظ على:



- الألوان.

- الخطوط.

- الأيقونات.

- البطاقات.

- Responsive.

- Mobile-first.

- RTL للعربية.

- الفرنسية عند الحاجة.



يمكن تحسين UI/UX، لكن لا تغير هوية الموقع بدون سبب.



---



📱 الهاتف



يجب أن تكون لوحة الرفع مناسبة للهاتف.



يستطيع المشرف من الهاتف:



تسجيل الدخول

↓

اختيار المادة

↓

اختيار PDF

↓

رفع

↓

متابعة Progress



بدون الحاجة إلى الكمبيوتر.



---



🧪 Validation



قبل رفع الملف:



تحقق من:



PDF فقط

حجم الملف

اسم الملف



وإذا كان الملف غير صالح:



❌ الملف غير صالح



بدلاً من رفعه.



---



⚠️ Error Handling



لا تستخدم Empty Catch.



كل خطأ يجب أن يظهر برسالة واضحة.



مثلاً:



❌ فشل رفع الملف

يرجى المحاولة مرة أخرى.



أو:



❌ حدث خطأ أثناء حفظ بيانات الملف.



أو:



❌ ليس لديك صلاحية لتنفيذ هذه العملية.



---



🗃️ SQL المطلوب



أنشئ SQL Migration احترافي يتضمن:



documents

user_roles

roles

RLS

Policies

Indexes

Functions

Triggers عند الحاجة



ويجب أن يكون قابلاً للتنفيذ مباشرة في:



Supabase → SQL Editor



لا تستخدم SQL ناقصاً أو تجريبياً.



---



⚙️ Supabase Edge Functions



أنشئ Edge Function مناسبة للتعامل مع Cloudinary.



مثلاً:



upload-to-cloudinary



وإذا لزم:



delete-from-cloudinary



يجب التحقق من:



Supabase Auth

+

User Role



قبل تنفيذ العملية.



---



🧩 Lovable



بما أنني أستخدم Lovable لبناء وتطوير المشروع:



- افحص الملفات الحالية قبل التعديل.

- لا تنشئ نسخة ثانية من المشروع.

- لا تحذف الكود الموجود بدون سبب.

- لا تستبدل الوظائف الحالية بـ Mock Data.

- استخدم Supabase Integration الخاصة بـ Lovable عندما يكون ذلك مناسباً.

- أنشئ migrations واضحة.

- أنشئ Edge Functions عند الحاجة.

- اربط الواجهة فعلياً بقاعدة البيانات.

- لا تستخدم بيانات وهمية.

- لا تضع Secrets في Frontend.

- اجعل التطبيق Production-ready.



---



🧱 إذا احتجت إعادة هيكلة



إذا كان "index.html" الحالي كبيراً جداً، يمكنك إعادة هيكلته إلى React/Next.js أو بنية مكونات منظمة فقط إذا كان ذلك سيجعل المشروع أكثر استقراراً وقابلية للصيانة.



لكن:



لا تغير التقنية لمجرد التغيير.



يجب أن تبقى جميع الوظائف الحالية تعمل.



---



🔄 Workflow النهائي



المستخدم العادي



يفتح الموقع

↓

يختار التخصص

↓

المستوى

↓

الفصل

↓

المادة

↓

الملف

↓

فتح PDF / تحميل



uploader



تسجيل الدخول

↓

Supabase Auth

↓

Role = uploader

↓

لوحة الرفع

↓

اختيار التخصص

↓

المستوى

↓

الفصل

↓

المادة

↓

نوع الملف

↓

اختيار PDF

↓

Upload

↓

Cloudinary

↓

secure_url

↓

Supabase Database

↓

Success



admin



تسجيل الدخول

↓

Supabase Auth

↓

Role = admin

↓

لوحة الإدارة الكاملة

↓

إدارة الملفات

إدارة المشرفين

الإعلانات

Analytics

الإعدادات



---



🧪 اختبارات إلزامية



بعد تنفيذ النظام اختبر:



Test 1



تسجيل الدخول بـ:



agwfmhmd@gmail.com



والتأكد من حصوله على:



admin



Test 2



تسجيل الدخول بـ:



unem-iscae@gmail.com



والتأكد من حصوله على:



uploader



Test 3



المستخدم العادي لا يستطيع رفع الملفات.



Test 4



uploader يستطيع رفع PDF.



Test 5



PDF يصل إلى Cloudinary.



Test 6



رابط Cloudinary يحفظ في Supabase.



Test 7



الملف يظهر في المادة الصحيحة.



Test 8



المستخدم يستطيع فتح PDF.



Test 9



المستخدم يستطيع تحميل PDF.



Test 10



uploader لا يستطيع حذف الملف.



Test 11



admin يستطيع حذف الملف.



Test 12



حذف الملف يحذف Cloudinary asset وSupabase record.



Test 13



لا يوجد أي Cloudinary API Secret في Frontend.



Test 14



الملفات القديمة من GitHub/Supabase Storage تستمر في العمل.



---



📦 المطلوب النهائي منك



بعد تنفيذ المشروع، أريد أن تقدم لي:



1. المشروع المعدل بالكامل.

2. SQL Migration كامل.

3. Supabase Edge Functions.

4. ".env.example".

5. إعداد Cloudinary.

6. إعداد Supabase.

7. طريقة إنشاء حسابات المشرفين.

8. شرح Roles.

9. شرح RLS.

10. طريقة اختبار رفع PDF.

11. طريقة نقل الملفات القديمة.

12. أي إعدادات إضافية مطلوبة في Lovable.



---



🚨 شروط نهائية



لا تستخدم:



Mock Data

Fake Upload

Fake Authentication

LocalStorage كقاعدة بيانات

Cloudinary Secret في Frontend

GitHub لتخزين الملفات الجديدة

Supabase Storage لتخزين الملفات الجديدة



أريد نظاماً حقيقياً.



---



✅ النتيجة المطلوبة



أريد أن تصبح منصة UNEM ISCAE منصة احترافية لإدارة وتوزيع ملفات الطلبة، بحيث:



Supabase

=

Authentication

+

Database

+

Roles

+

Permissions

+

Analytics



Cloudinary

=

PDF Storage



Lovable

=

Frontend + Application



GitHub

=

Code فقط



ويكون:



agwfmhmd@gmail.com

→ ADMIN كامل



unem-iscae@gmail.com

→ UPLOADER لرفع الملفات فقط



مع الحفاظ على التصميم والوظائف الحالية للموقع، وتحويل نظام الملفات إلى نظام سريع وآمن وقابل للتوسع. أرسل لي الملفات النهائية بعد التعديل مع شرح طريقة عمل كل شيء

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/a359dadd-371e-4d03-8e07-530325d7ce56).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
