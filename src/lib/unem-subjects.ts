// مصدر المواد الرسمي على الخادم — مطابق تماماً لـ subjectsData في src/legacy/app.html
// (لا تعدّل أحدهما دون الآخر)
export const LEVEL_SEMESTERS: Record<string, string[]> = {
  L1: ["S1", "S2"],
  L2: ["S3", "S4"],
  L3: ["S5", "S6"],
};

export function semestersForLevel(level: string): string[] {
  return LEVEL_SEMESTERS[level.toUpperCase()] ?? [];
}

export function isLevelSemesterValid(level: string, semester: string): boolean {
  return semestersForLevel(level).includes(semester.toUpperCase());
}

export const subjectsData: Record<string, Record<string, string[]>> = {
            "BA": { "S1":["Principe de gestion", "Comptabilité financière I", "Statistique descriptive I", "Mathématique", "Anglais I", "Méthodologie du travail universitaire", "MS office", "Introduction à l’économie", "Introduction au droit", "Technique de communication", "Archive S1"], "S2":["Comptabilité financière II", "Micro-finance", "Economie d’entreprise", "Statistique descriptive II", "Mathématiques financières", "Anglais II", "Aptitudes en TIC", "Développement personnel", "Microéconomie", "Droit des affaires", "Archive S2"], "S3":["Technique Bancaire", "Système financier mauritanien", "Gestion Financière", "Comptabilité des Sociétés", "Anglais des affaires", "Logiciels Bancaire", "Marketing", "Droit administrative", "Macroéconomie", "Méthodes d’aide à la décision", "Archive S3"], "S4":["Comptabilité des Société assurance", "Assurances des biens", "Comptabilité Bancaire", "Comptabilité de Gestion", "Finance des marchés", "Analyse Financière", "Gestion de la trésorerie", "GRH", "Droit des assurances", "Commerce international", "Archive S4"], "S5":["Gestion de portefeuille", "Comptabilité bancaire II", "Gestion des risques", "Finance islamique", "Stratégie d’entreprise", "Gestion de patrimoine", "Fiscalité", "Politiques et choix d’investissement", "Droit bancaire et financier", "Rapport de stage de la 2ème année", "Archive S5"], "S6":["Méthodologie de recherche", "Séminaire sur l'entrepreneuriat", "Mémoire de fin d'études", "Archive S6"] },
            "FC": { "S1":["Principe de gestion", "Comptabilité financière I", "Statistique descriptive I", "Mathématique", "Anglais I", "Méthodologie du travail universitaire", "MS office", "Introduction à l’économie", "Introduction au droit", "Technique de communication", "Archive S1"], "S2":["Comptabilité financière II", "Comptabilité financière II", "Micro-finance", "Economie d’entreprise", "Statistique descriptive II", "Mathématiques financières", "Anglais II", "Aptitudes en TIC", "Développement personnel", "Microéconomie", "Droit des affaires", "Archive S2"], "S3":["Technique Bancaire", "Système financier mauritanien", "Gestion Financière", "Comptabilité des Sociétés", "Anglais des affaires", "Logiciels Comptables", "Marketing", "Droit administrative", "Macroéconomie", "Méthodes d’aide à la décision", "Archive S3"], "S4":["Analyse financière", "Comptabilité de gestion", "Comptabilité des Sociétés II", "Finance islamique", "Gestion de portefeuilles", "Finance des marchés", "Droit du travail", "GRH", "Fiscalité", "Les instruments de Crédits", "Archive S4"], "S5":["Gestion de Trésorerie", "Contrôle de Gestion", "Reporting financier", "Méthodes d'évaluation de l'entreprise", "Stratégie d'entreprise", "Audit financier", "Normes Comptables Internationnales", "Choix d'investissement", "Droit bancaire et financier", "Rapport de stage de la 2ème année", "Archive S5"], "S6":["Méthodologie de recherche", "Séminaire sur l'entrepreneuriat", "Mémoire de fin d'études", "Archive S6"] },
            "TCM": { "S1":["Initiation à la gestion commerciale", "Principe de gestion", "Comptabilité financière I", "Introduction à l’économie", "Anglais I", "Techniques de communication", "MS office", "Statistique descriptive I", "Mathématique", "Introduction au droit", "Archive S1"], "S2":["Gestion commerciale de la relation client", "Economie d'entreprise", "Comptabilité financière II", "Gestion financière", "Anglais II", "Aptitudes en TIC", "Développement personnel", "Microéconomie", "Macro-économie", "Statistique descriptive II", "Archive S2"], "S3":["Marketing I", "Commerce international I", "Business Intelligence", "Gestion financière II", "Anglais des affaires", "Gestion de production", "Logiciels de gestion commerciale", "Droit administratif", "Droit des affaires", "GRH", "Archive S3"], "S4":["Marketing II", "Commerce international II", "Commerce électronique", "Finance Internationale", "Techniques Douanières et Transit", "Analyse financière", "Stratégie d’entreprise", "Techniques de sondage", "Droit des assurances", "Recherche opérationnelle", "Archive S4"], "S5":["Communication Marketing et commerciale", "Planification Marketing", "Techniques de Négociations Commerciales", "Fiscalité", "E-Marketing", "Finance des Marchés", "Etude des marchés", "Logistique du commerce international", "Management des projects", "Rapport de stage de la 2ème année", "Archive S5"], "S6":["Méthodologie de recherche", "Séminaire sur l'entrepreneuriat", "Mémoire de fin d'études", "Archive S6"] },
            "GRH": { "S1":["Initiation à la gestion des RH", "Principes de gestion", "Comptabilité financière I", "Introduction à l’économie", "Anglais I", "MS Office", "Techniques de Communication", "Statistique descriptive I", "Mathématiques", "Introduction au droit", "Archive S1"], "S2":["Evaluation des compétences", "Gestion Administrative des RH I", "Comptabilité financière II", "Gestion financière I", "Anglais II", "Aptitudes en TIC", "Développement personnel", "Rédaction administrative I", "Droit de travail I", "Statistiques descriptives II", "Archive S2"], "S3":["Gestion de la paie", "Recrutement", "Sécurité sociale I", "Gestion financière II", "Plan et ingénierie de formation", "Logiciels paie", "Anglais des affaires", "Rédaction administrative II", "Droit de travail II", "Droit des obligations", "Archive S3"], "S4":["GPEC", "Sécurité sociale II", "Stratégie d'entreprise", "Macroéconomie", "Microéconomie", "Analyse financière", "Communication interne", "Système d'information RH", "Gestion des conflits et négociations", "Droit Administratif", "Archive S4"], "S5":["Sources de motivation du personnel", "Politique de rémunération", "Audit des Ressources Humaines", "Droit pénal général", "Passation des marchés", "Sociologie des organisations", "Rapport de stage de la 2ème année", "Outils pilotage RH", "Management des projects", "Gestion des connaissances", "Archive S5"], "S6":["Méthodologie de recherche", "Séminaire sur l'entrepreneuriat", "Mémoire de fin d'études", "Archive S6"] },
            "SAE": { "S1":["Introduction à l’économie", "Principe de gestion", "Calcul intégral I", "Calcul matricielle I", "Probabilité I", "Statistique descriptive", "Anglais technique", "Méthodologie de travail universitaire", "Introduction au droit", "MS office I", "Archive S1"], "S2":["Macro-économie", "Microéconomie", "Calcul intégral II", "Calcul matricielle II", "Probabilité II", "Statistique descriptive II", "Anglais technique II", "MS office II", "Comptabilité générale", "Technique de communication", "Archive S2"], "S3":["Statistique inferential", "Technique de sondage", "Programmation linéaire", "Comptabilité nationale", "Microeconomie 2", "Macro-économie 2", "Marketing", "Mangement", "Monnaies et crédit", "Logiciel (spss ou R)", "Archive S3"], "S4":["Finance public", "GRH", "Econometrie", "Commerce extérieur", "Optimisation", "Analyse des données", "Logiciel statistique", "Gestion des projects", "Finance des marchés", "Économie Mauritanienne", "Archive S4"], "S5":["Analyse Démographique", "Analyse des données II", "Chaîne de Markov", "Econométrie II", "Economie Monétaire", "Modélisation Macroéconomique", "Séries temporelles", "Sujet", "Théorie de croissance", "Théorie de décision", "Archive S5"], "S6":["Méthodologie de recherche", "Séminaire sur l'entrepreneuriat", "Mémoire de fin d'études", "Archive S6"] },
            "IG": { "S1":["Introduction à l’économie", "Introduction au droit", "Comptabilité financière", "Algorithmiques", "Architecture des ordinateurs", "MS office", "Anglais technique", "Méthodologie du travail universitaire", "Logique mathématique", "Analyse I", "Archive S1"], "S2":["Comptabilité financière II", "principe de gestion", "Langage C", "Système d'exploitation", "Programation Web", "Python", "Anglais technique", "Technique de communication", "Algèbre linéaire", "Analyse II", "Archive S2"], "S3":["Comptabilité analytique I", "Stratégie d’entreprise", "Java I", "PHP-My SQL", "Conception des bases de données I", "Réseaux informatiques", "Modélisation UML MERISE", "Calcul multi-variables", "Logiciel de Calcul Scientifique", "probabilités et Statistiques", "Archive S3"], "S4":["Comptabilité analytique II", "Gestion des ресурс humaines", "Java II", "C#", "PHP Frameworks", "Gestion de projet informatique", "Théories des Graphes", "Bases de données", "Réseaux informatique II", "Compilations", "Archive S4"], "S5":["Contrôle de gestion", "Gestion financière", "Technologie DotNet", "JEE Framework", "Programmation Mobile", "Intelligence artificielle", "Bases des données avancées", "Administration des Systèmes", "Système d'Informations Géographique", "Rapport de stage de la 2ème année", "Archive S5"], "S6":["Méthodologie de recherche", "Séminaire sur l'entrepreneuriat", "Mémoire de fin d'études", "Archive S6"] },
            // ===== الماستر (مطابق تماماً لـ subjectsData في app.html) =====
            "MASTER_FC": {
                "S1":["Comptabilité sectorielle", "Consolidation des entreprises", "Théorie financière", "Contrôle de gestion approfondi", "Droit des sociétés", "Fiscalité approfondie", "Option 1 : Communication et développement personnel", "Option 2 : Anglais des affaires", "Archive S1"],
                "S2":["Normes comptables internationales", "Audit financier et révision des comptes", "Finance internationale", "Analyse stratégique", "Méthodes quantitatives", "Fiscalité internationale", "Option 1 : Analyse des données", "Option 2 : Théorie des marchés", "Archive S2"],
                "S3":["Comptabilité financière avancée", "Évaluation des entreprises", "Finance des marchés", "Stratégie d’entreprises", "Séries temporelles", "Option 1 : Droit pénal des affaires", "Option 2 : Méthodologie de recherche", "Archive S3"],
                "S4":["Mémoire ou Stage de Fin d’Études", "Archive S4"]
            },
            "MASTER_IG": {
                "S1":["Systèmes", "Algo et structure de données", "Réseaux avancés", "PROJETS Python", "Anglais", "Gestion des entreprises", "Java avancé", "Comptabilité et États Financiers", "Archive S1"],
                "S2":["Architecture et Administration des SGBD", "Recherche Opérationnelle", "Contrôle de Gestion", "Communication et Rédaction", "Génie Logiciel", "JEE", "Comptabilité et États Financiers", "Archive S2"],
                "S3":["Archive S3"],
                "S4":["Archive S4"]
            }
        };

export function subjectsFor(specialization: string, semester: string): string[] {
  const spec = subjectsData[specialization.toUpperCase()];
  return spec?.[semester.toUpperCase()] ?? [];
}

/* =====================================================================
   الماستر (M1 / M2)
   الواجهة تخزّن الماستر بمفاتيح الليسانس: التخصص FC/IG، والمستوى M1→L1 و M2→L2،
   والفصول S1..S4، وتُميَّز مواده بأسمائها (MASTER_FC / MASTER_IG في subjectsData).
   ===================================================================== */
export const MASTER_SPECS = ["FC", "IG"];

/** يحوّل أي صيغة ماستر (MASTER_FC / M1 / M2) إلى مفاتيح التخزين (FC + L1/L2) */
export function normalizeMasterScope(
  specialization: string,
  level: string,
): { specialization: string; level: string } {
  const spec = specialization.toUpperCase();
  const lvl = level.toUpperCase();
  const m = /^MASTER_(FC|IG)$/.exec(spec);
  return {
    specialization: m ? (m[1] ?? spec) : spec,
    level: lvl === "M1" ? "L1" : lvl === "M2" ? "L2" : lvl,
  };
}

/** مواد الماستر المسموحة لتخصص/فصل (بعد التطبيع: المستوى L1 أو L2 فقط) */
export function masterSubjectsFor(specialization: string, level: string, semester: string): string[] {
  const spec = specialization.toUpperCase();
  const lvl = level.toUpperCase();
  if (!MASTER_SPECS.includes(spec)) return [];
  if (lvl !== "L1" && lvl !== "L2") return [];
  return subjectsFor(`MASTER_${spec}`, semester);
}

/** رمز تخزين مادة الماستر (يفصلها عن مواد الليسانس ذات الاسم نفسه مثل Archive S1) — مطابق لـ masterStorageCode في app.html */
export function masterStorageCode(normalizedCode: string): string {
  return `m_${normalizedCode}`.slice(0, 60);
}
